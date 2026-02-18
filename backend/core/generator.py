import os
import yaml
from pathlib import Path
def generate_ansible_files(request_data):
    """
    Translates the ClusterDeploymentRequest into Ansible-readable files.
    Ensures auto-generated server_ids and LVS VIP are captured.
    Writes to backend/ansible/inventory/
    """
    
    # --- 1. SETUP PATHS ---
    # Current file: backend/core/generator.py
    # BASE_DIR should be 'backend'
    current_file = Path(__file__).resolve()
    base_dir = current_file.parent.parent  # Points to /backend
    
    inventory_dir = base_dir / 'ansible' / 'inventory'
    os.makedirs(inventory_dir, exist_ok=True)
    # Helper function to match the server_id logic in main.py
    def get_id(ip_str):
        try:
            octets = str(ip_str).split('.')
            return (int(octets[2]) * 256) + int(octets[3])
        except (IndexError, ValueError):
            return hash(str(ip_str)) % 4294967295
    # --- 2. BUILD THE INVENTORY (hosts.yml) ---
    inventory = {
        'all': {
            'children': {
                'galera': {
                    'hosts': {
                        node.node_name: {
                            'ansible_host': str(node.ip),
                            'server_id': node.server_id  # Passed from main.py
                        } for node in request_data.galera_nodes
                    }
                },
                'lvs': {
                    'hosts': {
                        f"lvs-node-{i+1}": {'ansible_host': str(ip)}
                        for i, ip in enumerate(request_data.lvs_ips)
                    }
                },
                'async': {
                    'hosts': {
                        'async-node': {
                            'ansible_host': str(request_data.async_ip),
                            'server_id': get_id(request_data.async_ip)
                        }
                    }
                },
                'monitoring': {
                    'hosts': {
                        'monitor-node': {'ansible_host': str(request_data.monitor_ip)}
                    }
                }
            },
            'vars': {
                'ansible_user': 'ubuntu',
                # Updated to use the standard Ubuntu home path
                'ansible_ssh_private_key_file': '/home/ubuntu/.ssh/id_ansible',
                'ansible_ssh_common_args': '-o StrictHostKeyChecking=no'
            }
        }
    }
    # --- 3. BUILD THE VARIABLES (extravars.yml) ---
    # Convert Pydantic model to a standard dictionary
    extravars = request_data.model_dump(mode='json')
    extravars['hcip_value'] = "10.0.0.100"
    # Calculate derived values needed for Galera templates
    ips = [str(node.ip) for node in request_data.galera_nodes]
    extravars['wsrep_cluster_address'] = f"gcomm://{','.join(ips)}"
    
    # Simplify the node list for easy iteration in Ansible Jinja2 templates
    extravars['galera_node_list'] = [
        {"name": node.node_name, "ip": str(node.ip), "id": node.server_id} 
        for node in request_data.galera_nodes
    ]
    # --- 4. WRITE TO DISK ---
    try:
        # Write inventory file
        inventory_file = inventory_dir / 'hosts.yml'
        with open(inventory_file, 'w') as f:
            yaml.dump(inventory, f, default_flow_style=False)
        
        # Write extravars file
        vars_file = inventory_dir / 'extravars.yml'
        with open(vars_file, 'w') as f:
            yaml.dump(extravars, f, default_flow_style=False)
            
        print(f"DEBUG: Ansible files generated successfully in {inventory_dir}")
        return True
    except Exception as e:
        print(f"ERROR: Failed to write Ansible files: {str(e)}")
        raise e

