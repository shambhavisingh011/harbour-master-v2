import re
import subprocess
import paramiko
import os
from typing import List, Dict, Tuple
class InfrastructureValidator:
    def __init__(self):
        # Path to the SSH key on the Head Node
        self.key_path = "/home/ubuntu/.ssh/id_ansible"
        
        # Regex: 8+ chars, 1 Upper, 1 Lower, 1 Number, 1 Special
        self.pass_regex = r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$"
    def check_ping(self, ip) -> bool:
        """Standard ICMP ping check."""
        try:
            res = subprocess.run(['ping', '-c', '1', '-W', '1', str(ip)], capture_output=True)
            return res.returncode == 0
        except Exception:
            return False
    def get_remote_resources(self, ip) -> Dict:
        """
        Connects via SSH to fetch actual CPU, RAM, and Disk from the target VM.
        This ensures the VM isn't under-provisioned before Ansible starts.
        """
        resources = {
            "os_family": "unknown",
            "cpus": 0,
            "ram_gb": 0.0,
            "disk_gb": 0.0
        }
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            ssh.connect(str(ip), username="ubuntu", key_filename=self.key_path, timeout=5)
            
            # 1. Check OS Family
            stdin, stdout, stderr = ssh.exec_command("cat /etc/os-release")
            os_out = stdout.read().decode().lower()
            if any(x in os_out for x in ["debian", "ubuntu"]):
                resources["os_family"] = "debian"
            elif any(x in os_out for x in ["rhel", "centos", "alma", "rocky"]):
                resources["os_family"] = "redhat"
            # 2. Check CPU Cores
            stdin, stdout, stderr = ssh.exec_command("nproc")
            resources["cpus"] = int(stdout.read().decode().strip())
            # 3. Check RAM (Total GB)
            stdin, stdout, stderr = ssh.exec_command("grep MemTotal /proc/meminfo | awk '{print $2}'")
            mem_kb = int(stdout.read().decode().strip())
            resources["ram_gb"] = round(mem_kb / (1024 * 1024), 2)
            # 4. Check Disk (Root partition GB)
            stdin, stdout, stderr = ssh.exec_command("df / --output=size | tail -1")
            disk_kb = int(stdout.read().decode().strip())
            resources["disk_gb"] = round(disk_kb / (1024 * 1024), 2)
            ssh.close()
        except Exception as e:
            print(f"SSH Resource Discovery Error on {ip}: {e}")
            
        return resources


    def validate_all(self, request) -> Tuple[bool, str]:
        """Main validation logic matching ClusterDeploymentRequest schema."""
        
        # 1. Connectivity Checks
        galera_ips = [str(n.ip) for n in request.galera_nodes]
        lvs_ips = [str(ip) for ip in request.lvs_ips]
        all_ips = galera_ips + lvs_ips + [str(request.monitor_ip), str(request.async_ip)]
        
        for ip in all_ips:
            if not self.check_ping(ip):
                return False, f"Connectivity Error: Node {ip} is unreachable (Ping failed)."
        # 2. Hardware Resource & OS Path Check
        # We check the first Galera node as a representative for the cluster hardware
        remote = self.get_remote_resources(galera_ips[0])
        
        if remote["os_family"] == "unknown":
            return False, f"SSH Error: Could not authenticate with {galera_ips[0]}. Check your SSH keys."
        # --- SAFE LIMIT VALIDATION ---
        # These match the limits we set to keep your laptop from crashing
        if remote["cpus"] < 1:
            return False, f"Resource Error: {galera_ips[0]} has only {remote['cpus']} CPU. Minimum 1 required."
        
        if remote["ram_gb"] < 1.7: # Allowing a small buffer for 2GB VMs
            return False, f"Resource Error: {galera_ips[0]} has only {remote['ram_gb']}GB RAM. Minimum 2GB required."
            
        if remote["disk_gb"] < 8.0:
            return False, f"Resource Error: {galera_ips[0]} has only {remote['disk_gb']}GB Disk. Minimum 20GB required."
        # OS Path Check for wsrep_provider
        if remote["os_family"] == "debian":
            expected_path = "/usr/lib/galera/libgalera_smm.so"
        elif remote["os_family"] == "redhat":
            expected_path = "/usr/lib64/galera/libgalera_smm.so"
        else:
            expected_path = request.wsrep_provider 
            
        if request.wsrep_provider != expected_path:
            return False, f"Path Error: For {remote['os_family']}, wsrep_provider should be {expected_path}"
        # 3. Password Complexity (SST Auth)
        try:
            sst_pass = request.wsrep_sst_auth.split(":")[1]
            if not re.match(self.pass_regex, sst_pass):
                return False, "Security Error: SST Password does not meet complexity standards (Upper, Lower, Num, Special)."
        except IndexError:
            return False, "Format Error: wsrep_sst_auth must be 'user:password'."

        # 4. Global MariaDB Requirements
        if request.binlog_format.upper() != "ROW":
            return False, "Config Error: binlog_format must be 'ROW'."
        if request.default_storage_engine.lower() != "innodb":
            return False, "Config Error: default_storage_engine must be 'InnoDB'."
        if int(request.innodb_autoinc_lock_mode) != 2:
            return False, "Config Error: innodb_autoinc_lock_mode must be 2."
        # 5. Version-Specific Logic
        v = request.mariadb_version
        if v == "10.5":
            if not request.expire_logs_days:
                return False, "10.5 Error: expire_logs_days is required."
        elif v in ["10.6", "10.11"]:
            if not request.binlog_expire_logs_seconds:
                return False, f"MariaDB {v} Error: binlog_expire_logs_seconds is required."
            if "REQUIRED_PRIMARY_KEY" not in (request.wsrep_mode or ""):
                return False, f"MariaDB {v} Error: wsrep_mode must include REQUIRED_PRIMARY_KEY."
        # 6. Final Server ID Integrity Check
        generated_ids = [n.server_id for n in request.galera_nodes]
        if len(generated_ids) != len(set(generated_ids)):
            return False, "Conflict: Auto-generated Server IDs must be unique across the cluster."
        
        return True, "All checks passed. Ready for deployment."
def verify_infrastructure(request):
    validator = InfrastructureValidator()
    return validator.validate_all(request)

