# Agent Tutorial

A multi-user AI agent web application built with FastAPI, WebSockets, and React.

## Project Structure

```
agent-tutorial/
├── server/                        ← Python backend
│   ├── src/
│   │   ├── agent.py               ← AI agentic loop (async, streaming)
│   │   ├── api.py                 ← FastAPI + WebSocket + auth endpoints
│   │   ├── auth.py                ← User storage, bcrypt hashing, JWT
│   │   ├── mcp_server.py          ← MCP tool server (FastMCP, port 8002)
│   │   ├── reminders.py           ← Reminder storage (per-user)
│   │   └── settings.py            ← Timezone settings (per-user)
│   ├── data/                      ← Runtime data (git-ignored)
│   │   ├── users.json             ← Registered users
│   │   └── {user_id}/
│   │       ├── reminders.json
│   │       └── settings.json
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── requirements.txt
│   └── .env
├── ui/                            ← React frontend
│   ├── src/
│   │   ├── app/store.ts           ← Redux store
│   │   ├── features/
│   │   │   ├── auth/              ← Login/register pages + RTK Query
│   │   │   └── chat/              ← Chat page + WebSocket
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
└── Makefile
```

## Quick Start

```bash
# Start everything (server + UI)
make up

# Open the app
open http://localhost:5173
```

Register an account, log in, and start chatting with the agent.

## Architecture

### What makes this an "agent"?

A plain LLM call is one shot — you send text, you get text back.

An agent adds three things:

1. **Tools (ability to act)** — the model calls real functions like `get_current_time` or `add_reminder`. A plain LLM would guess or hallucinate. The agent actually does something and gets a real result back.

2. **A loop (multi-step reasoning)** — after a tool runs, the result feeds back into the model, which decides: call another tool, or am I done? The model controls how many steps it takes.

3. **The model drives its own behavior** — the model chooses whether to use a tool, which tool, and what arguments. That decision-making separates an agent from a scripted workflow.

**LLM = thinks. Agent = thinks + acts + loops.**

### Components

```
Browser (React)
    │  WebSocket frames (tool_call / tool_result / message)
    ▼
FastAPI (port 8001)          ← JWT auth, WebSocket handler
    │  async tool calls
    ▼
MCP Server (port 8002)       ← FastMCP, owns all tool implementations
    │  reads/writes
    ▼
data/{user_id}/              ← per-user JSON files
```

### Startup sequence

```
entrypoint.sh
  ├── mkdir -p /app/data
  ├── starts mcp_server.py (background) → listens on :8002
  ├── waits until :8002 responds
  └── starts api.py (foreground) → listens on :8001
        └── fetches tool list from MCP server at startup
        └── WebSocket /ws?token=<jwt>
              └── each message → run_turn() → MCP tool calls → streamed frames back
```

## API

### Auth endpoints

```
POST /auth/register   { "email": "...", "password": "..." }  →  { "message": "..." }
POST /auth/login      { "email": "...", "password": "..." }  →  { "access_token": "..." }
```

### WebSocket

```
ws://localhost:8001/ws?token=<jwt>
```

**Client → Server:**
```json
{ "message": "remind me to brush my teeth at 10am" }
```

**Server → Client (streamed frames):**
```json
{ "type": "tool_call",   "name": "get_user_settings", "args": {} }
{ "type": "tool_result", "name": "get_user_settings", "result": "No settings saved yet." }
{ "type": "tool_call",   "name": "add_reminder", "args": { "description": "brush my teeth", "due_time": "..." } }
{ "type": "tool_result", "name": "add_reminder", "result": "Reminder set." }
{ "type": "message",     "content": "Done! Reminder set for 10:00 AM EST." }
```

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

## Per-User Data

Each user gets their own isolated data directory:

```
server/data/
├── users.json                  ← all registered users (email + bcrypt hash)
├── abc-123-uuid/
│   ├── reminders.json
│   └── settings.json
└── def-456-uuid/
    ├── reminders.json
    └── settings.json
```

The `user_id` (from the JWT) is injected automatically into every user-scoped tool call — the LLM never sees it.

## Configuration

**`server/.env`**
```
MCP_API_KEY=change-me-before-going-to-production
JWT_SECRET=change-me-before-going-to-production
```

**`ui/.env`**
```
VITE_API_URL=http://localhost:8001
VITE_WS_URL=ws://localhost:8001/ws
```
