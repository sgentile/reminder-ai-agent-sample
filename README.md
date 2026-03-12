# Agent Tutorial

A multi-user AI agent web application built with FastAPI, WebSockets, React, and PostgreSQL.

---

## Prerequisites

Before starting, you need **Ollama** running locally with a supported model pulled. See [Ollama Setup](#ollama-setup) below.

---

## Ollama Setup

The agent uses a locally-running LLM served by [Ollama](https://ollama.com). Docker talks to Ollama on your host machine — Ollama itself does **not** run inside Docker.

### 1. Install Ollama

**macOS:**
```bash
brew install ollama
```
Or download the app from [ollama.com/download](https://ollama.com/download).

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:** Download the installer from [ollama.com/download](https://ollama.com/download).

---

### 2. Start the Ollama service

**macOS / Linux:**
```bash
ollama serve
```

On macOS, if you installed the desktop app, Ollama starts automatically on login — you can skip this step.

Confirm it's running:
```bash
curl http://localhost:11434/api/tags
```
You should get a JSON response listing available models.

---

### 3. Pull a model

The default model is `gpt-oss:20b`. Pull whichever model you want to use:

```bash
# Default (what this project ships with)
ollama pull gpt-oss:20b

# Faster alternative — good enough for this domain
ollama pull llama3.1:8b

# Larger, higher quality
ollama pull llama3.3:70b
```

> **Choosing a model:** Any model with solid tool-calling support works. `llama3.1:8b` is the fastest option for this use case (simple tools, short conversations). Larger models handle more complex or ambiguous inputs better but are slower.

---

### 4. Change the model (optional)

Edit `server/Dockerfile` and update the `OLLAMA_MODEL` line:

```dockerfile
ENV OLLAMA_MODEL=llama3.1:8b
```

Then rebuild:
```bash
make down && make up
```

---

### How the container reaches Ollama

The server container connects to Ollama on your host machine via `host.docker.internal:11434`. This is set automatically in the Dockerfile:

```dockerfile
ENV OLLAMA_HOST=http://host.docker.internal:11434
```

- **Docker Desktop (Mac / Windows):** `host.docker.internal` resolves automatically.
- **Linux:** The `docker-compose.yml` includes `extra_hosts: host.docker.internal:host-gateway` which sets this up for you.

---

## Quick Start

```bash
# 1. Make sure Ollama is running with a model pulled (see above)

# 2. Clone and start everything
git clone <repo-url>
cd agent-tutorial
make up

# 3. Open the app
open http://localhost:5173
```

Register an account, log in, and start chatting with the agent.

---

## Project Structure

```
agent-tutorial/
├── server/
│   ├── src/
│   │   ├── agent.py          ← AI agentic loop (async, streaming)
│   │   ├── api.py            ← FastAPI + WebSocket + auth endpoints (port 8003)
│   │   ├── auth.py           ← Registration, bcrypt hashing, JWT
│   │   ├── db.py             ← PostgreSQL connection pool, schema init
│   │   ├── mcp_server.py     ← MCP tool server (FastMCP, port 8002)
│   │   ├── reminders.py      ← Reminder CRUD + background checker
│   │   └── settings.py       ← Per-user timezone settings
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── requirements.txt
│   └── .env
├── ui/
│   ├── src/
│   │   ├── app/store.ts      ← Redux store + RTK Query
│   │   ├── features/
│   │   │   ├── auth/         ← Login / register pages
│   │   │   └── chat/         ← Chat page, sidebar, live clock
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
└── Makefile
```

---

## Architecture

### What makes this an "agent"?

A plain LLM call is one shot — you send text, you get text back.

An agent adds three things:

1. **Tools (ability to act)** — the model calls real functions like `get_current_time` or `add_reminder`. A plain LLM would guess or hallucinate. The agent actually does something and gets a real result back.

2. **A loop (multi-step reasoning)** — after a tool runs, the result feeds back into the model, which decides: call another tool, or am I done? The model controls how many steps it takes.

3. **The model drives its own behavior** — the model chooses whether to use a tool, which tool, and what arguments. That decision-making separates an agent from a scripted workflow.

**LLM = thinks. Agent = thinks + acts + loops.**

---

### Components

```
Browser (React)
    │  WebSocket frames (tool_call / tool_result / message / reminder)
    ▼
FastAPI (port 8003)         ← JWT auth, WebSocket handler, reminder push
    │  async MCP tool calls
    ▼
MCP Server (port 8002)      ← FastMCP, owns all tool implementations
    │  reads/writes
    ▼
PostgreSQL (port 5432)      ← users, reminders, settings (Docker-internal only)

Ollama (host:11434)         ← LLM inference — runs on host, not in Docker
```

---

### Startup sequence

```
entrypoint.sh
  ├── starts mcp_server.py (background) → listens on :8002
  ├── waits until :8002 responds
  └── starts api.py (foreground) → listens on :8003
        ├── db.init_db() → creates PostgreSQL schema if not exists
        ├── reminders.start_checker() → background thread, polls every 5 s
        └── WebSocket /ws?token=<jwt>
              └── each message → run_turn() → MCP tool calls → streamed frames
```

---

## Database

All user data is stored in PostgreSQL. The schema is created automatically on startup.

| Table | Purpose |
|-------|---------|
| `users` | Email, bcrypt password hash, UUID primary key |
| `settings` | Per-user IANA timezone (e.g. `America/New_York`) |
| `reminders` | Description, due time, recurring flag, interval |

To inspect the database directly:
```bash
docker exec -it agent-tutorial-db-1 psql -U agent
```

---

## API

### Auth endpoints

```
POST /auth/register   { "email": "...", "password": "..." }  →  { "message": "..." }
POST /auth/login      { "email": "...", "password": "..." }  →  { "access_token": "..." }
```

### REST endpoints (Bearer token required)

```
GET    /settings              →  { "timezone": "America/New_York" }
GET    /reminders             →  [ { id, description, due_time, recurring, ... } ]
DELETE /reminders/{id}        →  204 No Content
```

### WebSocket

```
ws://localhost:8003/ws?token=<jwt>
```

**Client → Server:**
```json
{ "message": "remind me to stand up every 30 minutes" }
```

**Server → Client (streamed frames):**
```json
{ "type": "tool_call",   "name": "get_current_time", "args": {} }
{ "type": "tool_result", "name": "get_current_time", "result": "2026-03-11T14:05:00-05:00" }
{ "type": "tool_call",   "name": "add_recurring_reminder", "args": { ... } }
{ "type": "tool_result", "name": "add_recurring_reminder", "result": "Recurring reminder set." }
{ "type": "message",     "content": "Done! I'll remind you to stand up every 30 minutes." }
```

**Reminder push (server-initiated):**
```json
{ "type": "reminder", "content": "⏰ Stand up!", "reminder_id": 3, "recurring": true }
```

---

## UI Features

- **Streaming chat** — tool calls and results shown inline as collapsible steps
- **Recurring reminder color-coding** — each recurring reminder gets a consistent color in both chat bubbles and the sidebar
- **Collapsible sidebar** — lists all reminders with next-run time (updates every 5 s), trash icon with confirm dialog
- **Live clock** — current date/time in your local timezone, updates every second; automatically switches timezone when you ask the agent to change it
- **Clear chat** — wipes local message history without affecting server data

---

## Make Commands

| Command | What it does |
|---------|--------------|
| `make up` | Build and start all services (`docker compose up --build`) |
| `make down` | Stop all services |
| `make logs` | Tail logs from all services |
| `make ui-dev` | Run the UI dev server locally (no Docker) |
| `make server-dev` | Run the Python server locally (no Docker) |
| `make inspect` | List all MCP tools and parameters |
| `make call TOOL=list_reminders` | Call an MCP tool directly |
| `make mcp-inspector` | Open the MCP Inspector UI in your browser |

---

## MCP Inspector

```bash
# Terminal 1 — start services
make up

# Terminal 2 — open inspector
make mcp-inspector
```

Then in the browser at `http://localhost:6274`:
1. Set **Transport** → `Streamable HTTP`
2. Set **URL** → `http://localhost:8002/mcp`
3. Click **Connect**

You'll see all tools listed and can call them interactively.

---

## Configuration

**`server/.env`**
```
JWT_SECRET=change-me-before-going-to-production
MCP_API_KEY=change-me-before-going-to-production
DATABASE_URL=postgresql://agent:agent@localhost:5432/agent
```

> `DATABASE_URL` is overridden by `docker-compose.yml` when running in Docker — you only need it here for local development outside Docker.

**Model / Ollama** — set in `server/Dockerfile`:
```dockerfile
ENV OLLAMA_HOST=http://host.docker.internal:11434
ENV OLLAMA_MODEL=gpt-oss:20b
```

**Ports**

| Port | Service |
|------|---------|
| `5173` | React UI |
| `8003` | FastAPI / WebSocket |
| `8002` | MCP tool server |
| `11434` | Ollama (host machine) |
