import ansible_runner
import os
import yaml
from pathlib import Path
def run_deployment(log_callback=None):
    """
    Executes the Ansible playbook using ansible-runner.
    Coordinates the inventory and extravars generated in the previous step.
    
    :param log_callback: A function to handle real-time log streaming (WebSocket bridge)
    """
    # --- 1. SETUP PATHS ---
    current_file = Path(__file__).resolve()
    base_dir = current_file.parent.parent  # Points to /backend
    playbook_path = base_dir / 'ansible' / 'deploy_cluster.yml'
    inventory_path = base_dir / 'ansible' / 'inventory' / 'hosts.yml'
    vars_path = base_dir / 'ansible' / 'inventory' / 'extravars.yml'

    # --- 2. LOAD EXTRA VARIABLES ---
    extravars = {}
    if vars_path.exists():
        try:
            with open(vars_path, 'r') as f:
                extravars = yaml.safe_load(f)
        except Exception as e:
            print(f"ERROR: Could not parse {vars_path}: {e}")
    else:
        print(f"WARNING: {vars_path} not found. Running without extra vars.")

    # --- 3. DEFINE EVENT HANDLER FOR REAL-TIME LOGS ---
    # --- Inside core/orchestrator.py ---
    def event_handler(event):
        if log_callback:
            # 'stdout' contains the actual formatted line (e.g., "TASK [monitoring : ...]")
            stdout = event.get('stdout')
            if stdout:
                # We strip extra trailing newlines to keep the UI tidy
                log_callback(stdout.rstrip())
        return True

    # --- 4. LAUNCH ANSIBLE RUNNER ---
    print(f"\nLaunching Ansible Runner...")
    print(f"Private Data Dir: {base_dir}")
    print(f"Playbook: {playbook_path}")
    # We use event_handler to capture live output for the UI
    r = ansible_runner.run(
        private_data_dir=str(base_dir),
        playbook=str(playbook_path),
        inventory=str(inventory_path),
        extravars=extravars,
        event_handler=event_handler, # The Real-Time Hook
        quiet=False,  
    )
    # --- 5. RETURN RESULTS ---
    print(f"\n--- Deployment Summary ---")
    print(f"✅ Final Status: {r.status}")
    print(f"🔢 Return Code: {r.rc}")
    print(f"--------------------------\n")
    return r.status, r.rc

