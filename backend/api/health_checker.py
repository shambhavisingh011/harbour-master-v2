import pymysql
import paramiko
import logging
import re

# Set up logging to see exactly what happens in the terminal
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("HarborHealth")

class HarborHealthChecker:
    def __init__(self, request):
        self.request = request
        self.results = {
            "galera": [],
            "async": None,
            "lvs": [],
            "active_writer_ip": None, # New: To track which IP LVS is actually using
            "overall_status": "Healthy",
            "debug_logs": []
        }

    def _log_debug(self, msg):
        logger.info(msg)
        self.results["debug_logs"].append(msg)

    def _check_mariadb(self, host, user, password, is_async=False):
        label = "Async" if is_async else "Galera"
        self._log_debug(f"STEP: Connecting to {label} node at {host}...")
        
        try:
            conn = pymysql.connect(
                host=str(host), 
                user=user, 
                password=password, 
                connect_timeout=5,
                cursorclass=pymysql.cursors.DictCursor
            )
            self._log_debug(f"SUCCESS: Connected to {host}")
            
            with conn.cursor() as cursor:
                if not is_async:
                    self._log_debug(f"STEP: Checking Galera status on {host}...")
                    cursor.execute("SHOW STATUS LIKE 'wsrep_local_index';")
                    index = cursor.fetchone()
                    cursor.execute("SHOW STATUS LIKE 'wsrep_local_state_comment';")
                    state = cursor.fetchone()
                    
                    self._log_debug(f"DATA: {host} Index={index['Value'] if index else 'N/A'}, State={state['Value']}")
                    return {
                        "host": str(host),
                        "reachable": True,
                        "is_master_index": True if index and index['Value'] == '0' else False,
                        "sync_state": state['Value'] if state else "Unknown"
                    }
                else:
                    self._log_debug(f"STEP: Checking Async Slave status on {host}...")
                    cursor.execute("SHOW SLAVE STATUS;")
                    replica = cursor.fetchone()
                    
                    if not replica:
                        return {"host": str(host), "reachable": True, "io_running": "No", "sql_running": "No"}
                    
                    return {
                        "host": str(host),
                        "reachable": True,
                        "io_running": replica['Slave_IO_Running'],
                        "sql_running": replica['Slave_SQL_Running']
                    }
        except Exception as e:
            self._log_debug(f"FAIL: MariaDB check on {host} failed: {str(e)}")
            self.results["overall_status"] = "Degraded"
            return {"host": str(host), "reachable": False, "error": str(e)}

    def _check_lvs_ssh(self, lvs_ip, vip):
        self._log_debug(f"STEP: SSH connecting to LVS node {lvs_ip}...")
        try:
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(str(lvs_ip), username='ubuntu', key_filename="/home/ubuntu/.ssh/id_ansible", timeout=5)
            
            # 1. Check VIP
            _, stdout, _ = ssh.exec_command(f"ip addr show | grep {vip}")
            has_vip = bool(stdout.read().decode().strip())
            
            # 2. Identify the active Real Server (Writer)
            self._log_debug(f"STEP: Identifying active Writer via IPVS on {lvs_ip}...")
            _, stdout, _ = ssh.exec_command("sudo ipvsadm -Ln")
            ipvs_output = stdout.read().decode()
            
            # Logic: Look for the line following the VIP entry that has a non-zero weight or is active
            # In DR mode, we look for the Real Server IP under the VIP section
            active_ip = None
            lines = ipvs_output.split('\n')
            for i, line in enumerate(lines):
                if vip in line:
                    # Check the next lines for the Real Server (-> IP:Port)
                    for sub_line in lines[i+1:]:
                        if "->" in sub_line:
                            parts = sub_line.split()
                            # Example: "  -> 192.168.64.151:3306      Route   1      0          0"
                            server_ip_port = parts[1]
                            server_ip = server_ip_port.split(':')[0]
                            active_ip = server_ip
                            break # Assume first one found is the active one in this logic
                if active_ip: break

            ssh.close()
            return {
                "host": str(lvs_ip), 
                "ssh_reachable": True, 
                "holds_vip": has_vip, 
                "active_backend_writer": active_ip
            }
        except Exception as e:
            self._log_debug(f"FAIL: LVS SSH check on {lvs_ip} failed: {str(e)}")
            self.results["overall_status"] = "Degraded"
            return {"host": str(lvs_ip), "ssh_reachable": False, "error": str(e)}

    def run_diagnostics(self):
        self._log_debug("--- STARTING HARBOR MASTER DIAGNOSTICS ---")
        try:
            _, mysql_pass = self.request.wsrep_sst_auth.split(':')
        except:
            mysql_pass = ""

        # 1. Check Galera Nodes
        for node in self.request.galera_nodes:
            res = self._check_mariadb(node.ip, "root", mysql_pass)
            self.results["galera"].append(res)

        # 2. Check LVS Nodes and determine the "Active Writer" from their perspective
        detected_writers = set()
        for lvs_ip in self.request.lvs_ips:
            lvs_res = self._check_lvs_ssh(lvs_ip, self.request.lvs_vip)
            self.results["lvs"].append(lvs_res)
            if lvs_res.get("active_backend_writer"):
                detected_writers.add(lvs_res["active_backend_writer"])

        # 3. Cross-verify results
        if len(detected_writers) == 1:
            self.results["active_writer_ip"] = list(detected_writers)[0]
            self._log_debug(f"VERIFIED: All LVS nodes agree on Writer: {self.results['active_writer_ip']}")
        elif len(detected_writers) > 1:
            self.results["overall_status"] = "CRITICAL"
            self._log_debug(f"CONFLICT: LVS nodes disagree on active writer! Found: {detected_writers}")

        # 4. Check Async
        if self.request.async_ip:
            self.results["async"] = self._check_mariadb(self.request.async_ip, "root", mysql_pass, is_async=True)
            
        self._log_debug(f"--- DIAGNOSTICS COMPLETE: {self.results['overall_status']} ---")
        return self.results
