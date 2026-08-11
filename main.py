import os
import random
import asyncio
import json
from datetime import datetime, timedelta

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

AGENTIC_URL = os.getenv("AGENTIC_API_URL", "http://localhost:3001")

app = FastAPI(title="Kimi Dashboard API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===================== MOCK DATA GENERATORS =====================

def generate_timeseries(points=30):
    now = datetime.utcnow()
    data = []
    base = 1000
    for i in range(points):
        t = now - timedelta(minutes=points - i)
        base += random.randint(-200, 250)
        data.append({
            "timestamp": t.isoformat(),
            "tokens": max(200, base),
            "latency_ms": random.randint(45, 180),
            "requests": random.randint(50, 300),
            "errors": random.randint(0, 8)
        })
    return data

def generate_llm_metrics():
    return {
        "total_tokens_today": random.randint(2_500_000, 4_000_000),
        "avg_latency_ms": random.randint(65, 120),
        "success_rate": round(random.uniform(0.985, 0.999), 4),
        "active_models": [
            {"name": "kimi-k1", "load": round(random.uniform(0.4, 0.9), 2), "status": "healthy"},
            {"name": "kimi-moonshot", "load": round(random.uniform(0.3, 0.8), 2), "status": "healthy"},
            {"name": "kimi-vision", "load": round(random.uniform(0.2, 0.6), 2), "status": "degraded"},
        ],
        "top_intents": [
            {"intent": "coding", "share": 0.42},
            {"intent": "writing", "share": 0.28},
            {"intent": "analysis", "share": 0.18},
            {"intent": "other", "share": 0.12},
        ]
    }

def generate_system_metrics():
    return {
        "cpu_percent": round(random.uniform(35, 75), 1),
        "memory_percent": round(random.uniform(40, 80), 1),
        "disk_io_mbps": round(random.uniform(100, 800), 1),
        "network_mbps": round(random.uniform(200, 1500), 1),
        "active_pods": random.randint(24, 32),
        "queue_depth": random.randint(0, 150)
    }

def generate_recent_events(n=10):
    events = []
    templates = [
        ("user_login", "User {} logged in from {}"),
        ("llm_request", "Model {} processed {} tokens"),
        ("alert", "High latency detected in region {}"),
        ("deployment", "Service {} deployed v{}"),
        ("scale", "Auto-scaled {} pods in {}")
    ]
    for i in range(n):
        etype, msg = random.choice(templates)
        t = datetime.utcnow() - timedelta(seconds=random.randint(10, 600))
        events.append({
            "id": f"evt_{random.randint(10000,99999)}",
            "type": etype,
            "message": msg.format(random.choice(["us-east","eu-west","ap-south"]), random.randint(1,9)),
            "severity": random.choice(["info", "warning", "success", "error"]),
            "timestamp": t.isoformat()
        })
    return sorted(events, key=lambda x: x["timestamp"], reverse=True)

def generate_active_users():
    return {
        "total_now": random.randint(1200, 3500),
        "trend": random.choice(["up", "down", "stable"]),
        "trend_value": random.randint(-15, 25),
        "by_region": [
            {"region": "US-East", "users": random.randint(400, 900)},
            {"region": "EU-West", "users": random.randint(300, 700)},
            {"region": "APAC", "users": random.randint(200, 600)},
            {"region": "LATAM", "users": random.randint(100, 400)},
        ],
        "by_device": [
            {"device": "Desktop", "share": 0.55},
            {"device": "Mobile", "share": 0.35},
            {"device": "Tablet", "share": 0.10},
        ]
    }

# ===================== AGENTIC PLATFORM PROXY =====================

@app.get("/api/agentic/health")
async def agentic_health():
    """Proxy health check to the agentic-platform service"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{AGENTIC_URL}/health")
            return r.json()
    except Exception as e:
        return {"status": "unreachable", "error": str(e), "service": "agentic-platform"}

@app.get("/api/agentic/metrics")
async def agentic_metrics():
    """Proxy runtime metrics from agentic-platform"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{AGENTIC_URL}/metrics")
            return r.json()
    except Exception as e:
        return {"status": "unreachable", "error": str(e)}

@app.get("/api/agentic/data")
async def agentic_data():
    """Proxy sample data list from agentic-platform MongoDB"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{AGENTIC_URL}/api/data")
            return r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ===================== DASHBOARD REST ENDPOINTS =====================

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "time": datetime.utcnow().isoformat(),
        "agentic_api_url": AGENTIC_URL
    }

@app.get("/api/metrics/overview")
def overview():
    return {
        "requests_per_second": round(random.uniform(850, 1400), 1),
        "avg_response_time_ms": random.randint(45, 95),
        "error_rate": round(random.uniform(0.001, 0.015), 4),
        "active_sessions": random.randint(800, 2500),
        "uptime_hours": round(random.uniform(720, 900), 1),
        "daily_revenue": round(random.uniform(12000, 18000), 2)
    }

@app.get("/api/metrics/timeseries")
def timeseries():
    return generate_timeseries(60)

@app.get("/api/metrics/llm")
def llm():
    return generate_llm_metrics()

@app.get("/api/metrics/system")
def system():
    return generate_system_metrics()

@app.get("/api/events/recent")
def events(limit: int = 10):
    return generate_recent_events(limit)

@app.get("/api/users/active")
def active_users():
    return generate_active_users()

# ===================== WEBSOCKET =====================

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            payload = {
                "type": "tick",
                "timestamp": datetime.utcnow().isoformat(),
                "overview": {
                    "requests_per_second": round(random.uniform(850, 1400), 1),
                    "active_sessions": random.randint(800, 2500),
                    "error_rate": round(random.uniform(0.001, 0.015), 4),
                },
                "system": {
                    "cpu_percent": round(random.uniform(35, 75), 1),
                    "memory_percent": round(random.uniform(40, 80), 1),
                }
            }
            await websocket.send_json(payload)
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ===================== STATIC FRONTEND =====================

frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(os.path.join(frontend_path, "index.html")):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")

@app.get("/")
def root():
    index_file = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Kimi Dashboard API running. Place frontend files in ../frontend/"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)