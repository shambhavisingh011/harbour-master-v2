from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional
import re

IP_REGEX = r"^(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$"

class GaleraNodeConfig(BaseModel):
    """Configuration for an individual Galera Cluster node."""
    ip: str = Field(..., description="IPv4 address of the node")
    node_name: str = Field(..., description="Unique name for wsrep_node_name")
    server_id: Optional[int] = Field(0, description="MySQL server-id (Auto-calculated if 0)")
    
    @field_validator('ip')
    @classmethod
    def validate_ip_format(cls, v: str):
        if not re.match(IP_REGEX, v):
            raise ValueError(f"Invalid IP format: '{v}'. Must be a valid IPv4 address.")
        return v

class ClusterDeploymentRequest(BaseModel):
    # --- Infrastructure Groups ---
    mariadb_version: str = Field(..., pattern="^(10.6.16|10.6.21|10.11.16)$")
    galera_nodes: List[GaleraNodeConfig] = Field(..., min_length=3, max_length=3)

    lvs_ips: List[str] = Field(..., min_length=2, max_length=2)
    monitor_ip: str
    async_ip: str
    lvs_vip: str = Field(..., description="The Virtual IP that will float between LVS nodes")
    
    repl_user: str = Field(default="repl_user")
    repl_password: str = Field(..., min_length=8)
    db_admin_password: str = Field(
        ..., 
        min_length=8, 
        description="Password for the MariaDB 'root' user. Must be unique from SST password."
    )
    # --- Core Galera Parameters ---
    wsrep_cluster_name: str
    wsrep_on: str = "ON"
    wsrep_provider: str = "/usr/lib/galera/libgalera_smm.so"
    binlog_format: str = "ROW"
    default_storage_engine: str = "InnoDB"
    innodb_autoinc_lock_mode: int = 2
    bind_address: str = "0.0.0.0"

    # --- SST Settings ---
    wsrep_sst_method: str = "mariabackup"
    wsrep_sst_auth: str = Field(..., description="Credentials in 'user:password' format")

    # --- Version Specific Parameters ---
    wsrep_mode: Optional[str] = Field(default="REQUIRED_PRIMARY_KEY,STRICT_REPLICATION")
    binlog_expire_logs_seconds: Optional[int] = Field(default=604800)
    innodb_buffer_pool_instances: Optional[int] = Field(default=1)
    wsrep_slave_threads: Optional[int] = Field(default=4)
    innodb_undo_tablespaces: Optional[int] = Field(default=3)
    wsrep_gtid_domain_id: Optional[int] = Field(default=1)

    # Validate individual IP formats for standalone fields and lists
    @field_validator('monitor_ip', 'async_ip', 'lvs_vip', 'lvs_ips')
    @classmethod
    def validate_ips(cls, v):
        if isinstance(v, list):
            for ip in v:
                if not re.match(IP_REGEX, ip):
                    raise ValueError(f"Invalid IP format in list: '{ip}'")
        else:
            if not re.match(IP_REGEX, v):
                raise ValueError(f"Invalid IP format: '{v}'")
        return v

    @field_validator('galera_nodes')
    @classmethod
    def validate_unique_nodes(cls, v: List[GaleraNodeConfig]):
        names = [n.node_name for n in v]
        if len(set(names)) != len(names):
            raise ValueError("All wsrep_node_names must be unique.")
        return v

    @field_validator('wsrep_sst_auth')
    @classmethod
    def validate_sst_auth_format(cls, v: str):
        if ":" not in v:
            raise ValueError("SST Auth must be in 'user:password' format.")
        return v
    @model_validator(mode='after')
    def validate_password_uniqueness(self) -> 'ClusterDeploymentRequest':
        sst_password = self.wsrep_sst_auth.split(':')[1]
        if self.db_admin_password == sst_password:
            raise ValueError("Security Risk: Database Admin Password must be different from SST Password.")
        return self

    @model_validator(mode='after')
    def validate_all_ips_unique(self) -> 'ClusterDeploymentRequest':
        """The 'Master Check': Ensures all 8 infrastructure IPs are unique."""
        all_ips = []
        
        # 1. Collect from Galera nodes (3 IPs)
        all_ips.extend([node.ip for node in self.galera_nodes])
        
        # 2. Collect from LVS nodes (2 IPs)
        all_ips.extend(self.lvs_ips)
        
        # 3. Collect standalone (3 IPs: Monitor, Async, VIP)
        all_ips.append(self.monitor_ip)
        all_ips.append(self.async_ip)
        all_ips.append(self.lvs_vip)

        # 4. Check for duplicates
        if len(all_ips) != len(set(all_ips)):
            seen = set()
            dupes = [x for x in all_ips if x in seen or seen.add(x)]
            raise ValueError(f"IP Collision Detected! The following IPs are reused: {', '.join(set(dupes))}. "
                             "Each of the 8 infrastructure components must have a unique IP.")
        
        return self
