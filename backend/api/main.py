import sys
import os
import json
import asyncio
import re
import pymysql
import logging
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from jinja2 import Template
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool 

# --- Path Configuration ---
API_DIR = Path(__file__).resolve().parent
BACKEND_DIR = API_DIR.parent
ROOT_DIR = BACKEND_DIR.parent
sys.path.append(str(BACKEND_DIR))

# --- Internal Imports ---
from api.schemas import ClusterDeploymentRequest
from api.health_checker import HarborHealthChecker
from core.validator import verify_infrastructure
from core.generator import generate_ansible_files
from core.orchestrator import run_deployment

# --- Global State for SSE & Threading ---
main_loop = None
log_queue = asyncio.Queue()

def websocket_log_handler(message: str):
    """
    Callback used by Ansible. Cleans terminal codes and pushes 
    the message into the async queue from the Ansible thread.
    """
    global main_loop
    if main_loop and main_loop.is_running():
        # Clean ANSI color codes
        clean_msg = re.sub(r'\x1b\[[0-9;]*m', '', message) 
        # Thread-safe push into the async log_queue
        main_loop.call_soon_threadsafe(log_queue.put_nowait, clean_msg)

# --- API Configuration ---
app = FastAPI(
    title="Harbor Master Control Plane",
    description="Enterprise MariaDB Galera & LVS Orchestrator (SSE Stream Mode)",
    version="2.0.0"
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout) # This is the "SRE Standard"
    ]
)

logger = logging.getLogger("HarborBackend")

@app.on_event("startup")
async def startup_event():
    global main_loop
    main_loop = asyncio.get_running_loop()
    print(">>> Harbor Master: Event Loop Captured for SSE")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SSE Endpoint ---
@app.get("/api/logs/stream")
async def stream_logs(request: Request):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            try:
                log_chunk = await asyncio.wait_for(log_queue.get(), timeout=1.0)
                lines = log_chunk.splitlines()
                for line in lines:
                    formatted_line = line.strip()
                    if formatted_line:
                        yield f"data: {formatted_line}\n\n"
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

def calculate_deterministic_server_id(ip_str: str) -> int:
    try:
        octets = ip_str.split('.')
        return (int(octets[2]) * 256) + int(octets[3])
    except (IndexError, ValueError):
        return hash(ip_str) % 65535

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        errors.append({
            "loc": error["loc"],
            "msg": error["msg"],
            "type": error["type"]
        })
    return JSONResponse(status_code=400, content={"detail": errors})

@app.post("/validate")
async def validate_only(request: ClusterDeploymentRequest):
    """
    Dedicated validation endpoint for the 'Verify & Proceed' button.
    """
    for node in request.galera_nodes:
        node.server_id = calculate_deterministic_server_id(node.ip)
    
    success, val_message = verify_infrastructure(request)
    
    if not success:
        raise HTTPException(status_code=400, detail=val_message)
    
    return {"status": "Validated", "message": val_message}

@app.post("/preview-config")
async def preview_config(request: ClusterDeploymentRequest):
    """
    Generates a preview of the 60-galera.cnf using the provided node-names.
    """
    for node in request.galera_nodes:
        node.server_id = calculate_deterministic_server_id(str(node.ip))
    
    template_path = BACKEND_DIR / "ansible" / "roles" / "galera" / "templates" / "galera.cnf.j2"
    if not template_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    
    try:
        with open(template_path, 'r') as f:
            template_content = f.read()
        
        ips = [str(node.ip) for node in request.galera_nodes]
        cluster_address = f"gcomm://{','.join(ips)}"
        
        # Use the first node from the request as the context for the preview
        target_node = request.galera_nodes[0]
        
        template = Template(template_content)
        rendered_conf = template.render(
            **request.model_dump(mode='json'),
            wsrep_cluster_address=cluster_address,
            inventory_hostname=target_node.node_name, # FIXED: Picks user input
            ansible_host=str(target_node.ip)
        )
        return {"filename": "60-galera.cnf", "content": rendered_conf}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/deploy")
async def trigger_deployment(request: ClusterDeploymentRequest):
    # Clear logs for a clean run
    while not log_queue.empty():
        log_queue.get_nowait()
        
    for node in request.galera_nodes:
        node.server_id = calculate_deterministic_server_id(str(node.ip))
        
    success, val_message = verify_infrastructure(request)
    if not success:
        raise HTTPException(status_code=400, detail=val_message)
        
    try:
        generate_ansible_files(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation Error: {str(e)}")
        
    try:
        websocket_log_handler("\n>>> System: Orchestration initializing via SSE...\n")
        status, return_code = await run_in_threadpool(
            run_deployment, 
            log_callback=websocket_log_handler
        )
        if return_code != 0:
            websocket_log_handler(f"\n Ansible Error Detected: {status}\n")
            raise HTTPException(status_code=500, detail=f"Ansible Failed: {status}")
            
        websocket_log_handler("\n>>> System: Deployment Successful. Running Diagnostics...\n")
        
        checker = HarborHealthChecker(request)
        health_report = checker.run_diagnostics()
        
        return {
            "status": "Success",
            "cluster_name": request.wsrep_cluster_name,
            "lvs_vip": str(request.lvs_vip),
            "health_report": health_report,
            "message": "Deployment complete."
        }
        
    except Exception as e:
        websocket_log_handler(f"\n System Error: {str(e)}\n")
        raise HTTPException(status_code=500, detail=f"System Error: {str(e)}")
@app.post("/api/create-db")
async def create_custom_db(data: dict):
    # 1. Normalize and Extract
    db_name = data.get('db_name', '').lower().strip()
    db_user = data.get('db_user', '').lower().strip()
    db_pass = data.get('db_password')
    role = data.get('role', 'Read-Only')
    ttl = data.get('ttl', 30)
    target_vip = data.get('vip')
    admin_pass = data.get('admin_password')

    # 2. SRE Guardrail: Forbidden Names Check
    FORBIDDEN = ['mysql', 'root', 'admin', 'sys', 'information_schema', 'performance_schema']
    if db_name in FORBIDDEN or db_user in FORBIDDEN:
        raise HTTPException(status_code=403, detail="Use of system-reserved names is forbidden.")

    # 3. Map Roles
    role_map = {
        "Read-Only": "SELECT, SHOW VIEW",
        "Read-Write": "SELECT, INSERT, UPDATE, DELETE",
        "DDL-Admin": "ALL PRIVILEGES"
    }
    privs = role_map.get(role, "SELECT")

    try:
        conn = pymysql.connect(
            host=target_vip, 
            user='root', 
            password=admin_pass,
            autocommit=True 
        )
        
        with conn.cursor() as cursor:
            # 4. Conflict Detection: User Check (STILL REQUIRED)
            # We never want to overwrite an existing user's password or grants accidentally
            cursor.execute("SELECT User FROM mysql.user WHERE User = %s", (db_user,))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="User already exists. Choose a different username.")

            # 5. Database Presence Check (SOFT CHECK)
            cursor.execute("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = %s", (db_name,))
            db_exists = cursor.fetchone()

            # 6. Execution Logic
            if not db_exists:
                # Scenario A: Brand new database
                cursor.execute(f"CREATE DATABASE `{db_name}`;")
                status_msg = f"Successfully created database {db_name} and user {db_user}."
            else:
                # Scenario B: Existing database, new tenant
                status_msg = f"User {db_user} successfully attached to existing database {db_name}."

            # 7. Create User and Grant (Works for both scenarios)
            grant_sql = f"GRANT {privs} ON `{db_name}`.* TO %s@'%%' IDENTIFIED BY %s"
            cursor.execute(grant_sql, (db_user, db_pass))

            # 8. Apply TTL
            expire_sql = f"ALTER USER %s@'%%' PASSWORD EXPIRE INTERVAL %s DAY"
            cursor.execute(expire_sql, (db_user, ttl))
            
            cursor.execute("FLUSH PRIVILEGES;")

        return {"status": "success", "detail": status_msg}

    except pymysql.Error as e:
        error_msg = e.args[1] if len(e.args) > 1 else str(e)
        raise HTTPException(status_code=500, detail=f"Database Engine Error: {error_msg}")
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"System Error: {str(e)}")
    finally:
        if 'conn' in locals(): conn.close()
