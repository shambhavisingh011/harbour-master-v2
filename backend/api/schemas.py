from pydantic import BaseModel, Field, field_validator
from typing import List, Optional

class GaleraNodeConfig(BaseModel):
    """Configuration for an individual Galera Cluster node."""
    ip: str = Field(..., description="IPv4 address of the node")
    node_name: str = Field(..., description="Unique name for wsrep_node_name")
    server_id: Optional[int] = Field(0, description="MySQL server-id (Auto-calculated if 0)")
class ClusterDeploymentRequest(BaseModel):
    # --- Infrastructure Groups ---
    # Regex updated to strictly match your UI options
    mariadb_version: str = Field(..., pattern="^(10.5.16|10.6.21|10.11)$")
    galera_nodes: List[GaleraNodeConfig] = Field(..., min_length=3, max_length=3)
    
    # Changed IP lists and single IPs to str for better reliability
    lvs_ips: List[str] = Field(..., min_length=2, max_length=2)
    monitor_ip: str
    async_ip: str
    lvs_vip: str = Field(..., description="The Virtual IP that will float between LVS nodes")
    repl_user: str = Field(default="repl_user")
    repl_password: str = Field(..., min_length=8)

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

  
    # These fields are now Optional but have defaults so Pydantic won't fail if they are missing

    wsrep_strict_ddl: Optional[str] = Field(default="ON")
    wsrep_replicate_myisam: Optional[str] = Field(default="OFF")
    expire_logs_days: Optional[int] = Field(default=7)
    wsrep_mode: Optional[str] = Field(default="REQUIRED_PRIMARY_KEY,STRICT_REPLICATION")
    binlog_expire_logs_seconds: Optional[int] = Field(default=604800)
    innodb_buffer_pool_instances: Optional[int] = Field(default=1)
    wsrep_slave_threads: Optional[int] = Field(default=4)
    innodb_undo_tablespaces: Optional[int] = Field(default=3)
    wsrep_gtid_domain_id: Optional[int] = Field(default=1)

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

