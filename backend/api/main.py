import sys
import os
import json
import asyncio
import re
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
# This queue stores logs until the browser "consumes" them
log_queue = asyncio.Queue()
def websocket_log_handler(message: str):
    """
    Callback used by Ansible. Cleans terminal codes and pushes 
    the message into the async queue from the Ansible thread.
    """
    global main_loop
    if main_loop and main_loop.is_running():
        # 1. Clean ANSI color codes
        clean_msg = re.sub(r'\x1b\[[0-9;]*m', '', message)  #for color
        
        # 2. Thread-safe push into the async log_queue
        # We use call_soon_threadsafe to ensure the async queue is handled correctly
        main_loop.call_soon_threadsafe(log_queue.put_nowait, clean_msg)

# --- API Configuration ---
app = FastAPI(
    title="Harbor Master Control Plane",
    description="Enterprise MariaDB Galera & LVS Orchestrator (SSE Stream Mode)",
    version="2.0.0"
)

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
    """
    Standard HTTP GET request that stays open to stream data.
    """
    async def event_generator():
        while True:
            # If the browser closes the tab, stop the generator
            if await request.is_disconnected():
                break
            
            try:
                # Wait for a new log chunk (timeout allows checking for disconnects)
                log_chunk = await asyncio.wait_for(log_queue.get(), timeout=1.0)
                
                # Split multi-line output (like TASK headers) into individual SSE messages
                lines = log_chunk.splitlines()
                for line in lines:
                    formatted_line = line.strip()
                    if formatted_line:
                        # SSE Protocol format: "data: <message>\n\n"
                        yield f"data: {formatted_line}\n\n"
                        
            except asyncio.TimeoutError:
                # Send a keep-alive comment to prevent browser timeouts
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

@app.post("/preview-config")
async def preview_config(request: ClusterDeploymentRequest):
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
        
        template = Template(template_content)
        rendered_conf = template.render(
            **request.model_dump(mode='json'),
            wsrep_cluster_address=cluster_address,
            inventory_hostname="preview-node-01",
            ansible_host=str(request.galera_nodes[0].ip)
        )
        return {"filename": "60-galera.cnf", "content": rendered_conf}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/deploy")
async def trigger_deployment(request: ClusterDeploymentRequest):
    # Clear any old logs from previous runs
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
        # Push initial log
        websocket_log_handler("\n>>> System: Orchestration initializing via SSE...\n")
        # Run Ansible in a background thread to prevent blocking the HTTP server
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

