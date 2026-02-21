import pymysql
import paramiko
import logging
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("HarborHealth")

class HarborHealthChecker:
    def __init__(self, request):
        self.request = request
        self.results = {
            "galera": [],
            "async": None,
            "lvs": [],
            "active_writer_ip": None,
            "cluster_size": 0,
            "overall_status": "Healthy",
            "debug_logs": []
        }

    def _log_debug(self, msg):
        logger.info(msg)
        self.results["debug_logs"].append(msg)

    def _check_mariadb(self, host, user, password, is_async=False):
        label = "Async" if is_async else "Galera"
        self._log_debug(f"--- Checking {label} Node: {host} ---")
        
        try:
            conn = pymysql.connect(
                host=str(host), user=user, password=password, 
                connect_timeout=5, cursorclass=pymysql.cursors.DictCursor
            )
            self._log_debug(f"  [PASS] MySQL Connection established.")
            
            with conn.cursor() as cursor:
                if not is_async:
                    # Check 1: Cluster Size
                    cursor.execute("SHOW STATUS LIKE 'wsrep_cluster_size';")
                    size = cursor.fetchone()
                    c_size = int(size['Value']) if size else 0
                    self.results["cluster_size"] = c_size
                    self._log_debug(f"  [DATA] wsrep_cluster_size: {c_size}")

                    # Check 2: Sync State
                    cursor.execute("SHOW STATUS LIKE 'wsrep_local_state_comment';")
                    state = cursor.fetchone()
                    s_val = state['Value'] if state else "Unknown"
                    self._log_debug(f"  [DATA] wsrep_local_state_comment: {s_val}")
                    
                    return {"host": str(host), "reachable": True, "sync_state": s_val}
                else:
                    # Check 3: Async Slave Status
                    cursor.execute("SHOW SLAVE STATUS;")
                    replica = cursor.fetchone()
                    if replica:
                        io = replica['Slave_IO_Running']
                        sql = replica['Slave_SQL_Running']
                        self._log_debug(f"  [DATA] Slave_IO_Running: {io}")
                        self._log_debug(f"  [DATA] Slave_SQL_Running: {sql}")
                        return {"host": str(host), "reachable": True, "io": io, "sql": sql}
                    self._log_debug("  [FAIL] No replication status found.")
                    return {"host": str(host), "reachable": True, "io": "No", "sql": "No"}
        except Exception as e:
            self._log_debug(f"  [FAIL] Connection Error: {str(e)}")
            self.results["overall_status"] = "Degraded"
            return {"host": str(host), "reachable": False}

    def _check_lvs_ssh(self, lvs_ip, vip):
        self._log_debug(f"--- Checking LVS Node: {lvs_ip} ---")
        try:
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(str(lvs_ip), username='ubuntu', key_filename="/home/ubuntu/.ssh/id_ansible", timeout=5)
            self._log_debug(f"  [PASS] SSH Connection established.")

            # Check 1: VIP Ownership
            _, stdout, _ = ssh.exec_command(f"ip addr show | grep {vip}")
            has_vip = bool(stdout.read().decode().strip())
            self._log_debug(f"  [DATA] Holds VIP ({vip}): {has_vip}")

            # Check 2: IPVS Table Audit
            _, stdout, _ = ssh.exec_command("sudo ipvsadm -Ln")
            ipvs_output = stdout.read().decode()
            self._log_debug(f"  [STEP] Parsing `ipvsadm -Ln` output...")

            active_ip = None
            lines = ipvs_output.split('\n')
            for i, line in enumerate(lines):
                if vip in line:
                    for sub_line in lines[i+1:]:
                        if "->" in sub_line:
                            parts = sub_line.split()
                            server_ip = parts[1].split(':')[0]
                            weight = int(parts[3])
                            if weight > 0:
                                active_ip = server_ip
                                self._log_debug(f"  [DATA] Found Active Backend: {active_ip} (Weight: {weight})")
                                break
            
            if not active_ip:
                self._log_debug(f"  [WARN] No active backends found in IPVS for VIP {vip}")

            ssh.close()
            return {"host": str(lvs_ip), "ssh": True, "vip": has_vip, "target": active_ip}
        except Exception as e:
            self._log_debug(f"  [FAIL] SSH Error: {str(e)}")
            return {"host": str(lvs_ip), "ssh": False}

    def run_diagnostics(self):
        self._log_debug("Starting Harbor Master Diagnostic Suite...")
        try:
            _, mysql_pass = self.request.wsrep_sst_auth.split(':')
        except: mysql_pass = ""

        # Tier 1: Galera
        for node in self.request.galera_nodes:
            self.results["galera"].append(self._check_mariadb(node.ip, "root", mysql_pass))

        # Tier 2: LVS
        lvs_targets = {}
        for lvs_ip in self.request.lvs_ips:
            res = self._check_lvs_ssh(lvs_ip, self.request.lvs_vip)
            self.results["lvs"].append(res)
            if res.get("target"):
                lvs_targets[res["host"]] = res["target"]

        # Tier 3: Async
        if self.request.async_ip:
            self.results["async"] = self._check_mariadb(self.request.async_ip, "root", mysql_pass, is_async=True)

        # Cross-Tier Consensus Logic
        unique_targets = set(lvs_targets.values())
        if len(unique_targets) == 1:
            self.results["active_writer_ip"] = list(unique_targets)[0]
            self._log_debug(f"CONSENSUS: All LVS nodes routing to {self.results['active_writer_ip']}")
        elif len(unique_targets) > 1:
            self.results["overall_status"] = "CRITICAL"
            self._log_debug(f"CRITICAL: Split-brain detected! LVS targets: {lvs_targets}")

        self._log_debug(f"Final Cluster Status: {self.results['overall_status']}")
        return self.results
