# Ornith Mesh — Local-First AI Microservices Blueprint

## Architecture at a Glance

The system is a **reverse proxy with intent**, not a monolith. Each component is a route in a local mesh:

| Endpoint | Role | Analog |
|---|---|---|
| `POST /v1/chat/completions → qwen3.5` | Heavy reasoning API | Teacher (rare, high-latency) |
| `POST /v1/chat/completions → deepseek-r1` | Deep analysis API | Specialized teacher |
| `POST /api/generate → ornith:9b` | Fast local distill | Edge cache (always warm) |
| `POST /mcp/search → duckduckgo` | Web search sidecar | Tool container |
| `POST /mcp/transcribe → youtube` | Transcription sidecar | Tool container |

---

## Component Map

```
Client Request
    │
    ▼
┌─────────────────────┐
│   Nginx / Reverse Proxy  │   ← Routes by path + intent classification
└──────────┬───────────┘
           │
    ┌──────▼──────┐     ┌───────┐     ┌─────────┐
    │ Intent Router │───▶│ Model │     │ Tooling │
    │ (qwen / ds-r1 │     │ Mesh │────▶│ Sidecars│
    │  / ornith)    │     │ API  │     │         │
    └──────────────┘     └───────┘     └─────────┘
           │                    ▲              │
           ▼                    │              ▼
   ┌──────────────┐      ┌──────────┐    ┌──────────┐
   │ KV-Shared Store│     │ Context  │    │ Docker   │
   │ (session state)│     │ Window   │    │ Compose  │
   └──────────────┘      └──────────┘    └──────────┘
```

---

## REST Schema Draft

### Core Chat Endpoints

```yaml
paths:
  /v1/chat/completions:
    post:
      summary: Unified chat completions (routes to model via intent)
      parameters:
        - name: model
          in: query
          schema: { type: string, enum: [qwen3.5, deepseek-r1, ornith] }
        - name: temperature
          in: query
          schema: { type: number, default: 0.7 }
      responses:
        '200': { description: Chat response from selected model }

  /api/generate:
    post:
      summary: Fast local generation (ornith:9b edge cache)
      responses:
        '200': { description: Quantized generation output }

  /mcp/search:
    post:
      summary: DuckDuckGo web search via MCP sidecar
      requestBody: { content: application/json, schema: { type: object } }

  /mcp/transcribe:
    post:
      summary: YouTube transcript extraction via MCP sidecar
```

---

## Docker Compose Wiring

```yaml
services:
  nginx-proxy:
    image: nginx:alpine
    ports: ["8080:80"]
    volumes: [./nginx.conf:/etc/nginx/conf.d/default.conf]

  qwen-server:
    build: { context: ./models/qwen, dockerfile: Dockerfile }
    environment: { MODEL: qwen3.5:latest, PROVIDER: ollama }

  deepseek-server:
    build: { context: ./models/deepseek-r1, dockerfile: Dockerfile }
    environment: { MODEL: deepseek-r1 }

  ornith-distill:
    image: vllm:latest
    command: [--model, ornith:9b, --quantization, awq]
    volumes: [./data:/data]

  mcp-duckduckgo:
    image: mcp/duckduckgo
    ports: ["8081:8080"]

  mcp-youtube:
    image: mcp/youtube-transcript
    ports: ["8082:8080"]
```

---

## Intent Router Logic (Pseudocode)

```python
def route_request(payload):
    if payload["intent"] == "reasoning":
        return qwen3.5
    elif payload["intent"] == "analysis":
        return deepseek-r1
    elif payload["model"] in ["fast", "local"]:
        return ornith:9b   # edge cache path
    elif payload["tool"] == "search":
        return mcp/duckduckgo
    elif payload["tool"] == "transcribe":
        return mcp/youtube