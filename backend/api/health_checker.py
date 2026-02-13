import pymysql
import paramiko
import logging
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
            "overall_status": "Healthy",
            "debug_logs": [] # New: list to store step-by-step failures
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
                    cursor.execute("SHOW STATUS LIKE 'wsrep_cluster_size';")
                    size = cursor.fetchone()
                    cursor.execute("SHOW STATUS LIKE 'wsrep_local_state_comment';")
                    state = cursor.fetchone()
                    
                    self._log_debug(f"DATA: {host} Size={size['Value']}, State={state['Value']}")
                    return {
                        "host": str(host),
                        "reachable": True,
                        "cluster_size": int(size['Value']) if size else 0,
                        "sync_state": state['Value'] if state else "Unknown"
                    }
                else:
                    self._log_debug(f"STEP: Checking Async Slave status on {host}...")
                    cursor.execute("SHOW SLAVE STATUS;")
                    replica = cursor.fetchone()
                    
                    if not replica:
                        self._log_debug(f"WARNING: No replication found on {host}")
                        return {"host": str(host), "reachable": True, "io_running": "No", "sql_running": "No"}
                    
                    self._log_debug(f"DATA: {host} IO={replica['Slave_IO_Running']}, SQL={replica['Slave_SQL_Running']}")
                    return {
                        "host": str(host),
                        "reachable": True,
                        "io_running": replica['Slave_IO_Running'],
                        "sql_running": replica['Slave_SQL_Running']
                    }
        except Exception as e:
            error_msg = f"FAIL: MariaDB check on {host} failed: {str(e)}"
            self._log_debug(error_msg)
            self.results["overall_status"] = "Degraded"
            return {"host": str(host), "reachable": False, "error": str(e)}
    def _check_lvs_ssh(self, lvs_ip, vip):
        self._log_debug(f"STEP: SSH connecting to LVS node {lvs_ip}...")
        try:
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(str(lvs_ip), username='ubuntu', key_filename="/home/ubuntu/.ssh/id_ansible", timeout=5)
            
            self._log_debug(f"STEP: Checking VIP {vip} on {lvs_ip}...")
            _, stdout, _ = ssh.exec_command(f"ip addr show | grep {vip}")
            has_vip = bool(stdout.read().decode().strip())
            
            self._log_debug(f"STEP: Checking IPVS routes on {lvs_ip}...")
            _, stdout, _ = ssh.exec_command("sudo ipvsadm -Ln")
            output = stdout.read().decode()
            has_routes = "Route" in output or "TCP" in output
            
            ssh.close()
            self._log_debug(f"SUCCESS: LVS check complete for {lvs_ip}. VIP={has_vip}, Routes={has_routes}")
            return {"host": str(lvs_ip), "ssh_reachable": True, "holds_vip": has_vip, "routing_active": has_routes}
        except Exception as e:
            error_msg = f"FAIL: LVS SSH check on {lvs_ip} failed: {str(e)}"
            self._log_debug(error_msg)
            self.results["overall_status"] = "Degraded"
            return {"host": str(lvs_ip), "ssh_reachable": False, "error": str(e)}


    def run_diagnostics(self):
        self._log_debug("--- STARTING HARBOR MASTER DIAGNOSTICS ---")
        try:
            _, mysql_pass = self.request.wsrep_sst_auth.split(':')
        except:
            mysql_pass = ""
        # 1. Galera
        for node in self.request.galera_nodes:
            self.results["galera"].append(self._check_mariadb(node.ip, "root", mysql_pass))
        # 2. Async
        if self.request.async_ip:
            self.results["async"] = self._check_mariadb(self.request.async_ip, "root", mysql_pass, is_async=True)
        # 3. LVS
        for lvs_ip in self.request.lvs_ips:
            self.results["lvs"].append(self._check_lvs_ssh(lvs_ip, self.request.lvs_vip))
            
        self._log_debug(f"--- DIAGNOSTICS COMPLETE: {self.results['overall_status']} ---")
        return self.results

