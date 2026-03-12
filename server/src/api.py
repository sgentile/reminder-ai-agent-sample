import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager

# Ensure src/ siblings are importable when run as __main__
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import auth
import agent
import db
import reminders
import settings

# Tool schemas fetched from the MCP server once at startup and reused for
# every WebSocket session — avoids re-fetching on each connection.
_tools: list = []

# Active WebSocket send callbacks, keyed by user_id.
# The reminder checker uses this to push notifications to connected clients.
_connections: dict[str, asyncio.AbstractEventLoop] = {}
_send_fns: dict[str, object] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _tools
    db.init_db()
    print(f"Fetching tools from MCP server at {agent.MCP_URL}...")
    _tools = await agent._fetch_tools()
    print(f"Loaded {len(_tools)} tools: {[t['function']['name'] for t in _tools]}")
    reminders.start_checker(notify_fn=_push_reminder)
    yield


def _push_reminder(user_id: str, text: str, reminder_id: int = 0, recurring: bool = False) -> None:
    """Called from the background checker thread to push a reminder to the browser."""
    loop = _connections.get(user_id)
    send = _send_fns.get(user_id)
    print(f"[push_reminder] user={user_id[:8]} connected={loop is not None} keys={[k[:8] for k in _connections]}", flush=True)
    if loop and send:
        future = asyncio.run_coroutine_threadsafe(
            send({"type": "reminder", "content": text, "reminder_id": reminder_id, "recurring": recurring}),
            loop,
        )
        try:
            future.result(timeout=5)
        except Exception as e:
            print(f"[push_reminder] failed to send: {e}", flush=True)


def _require_user(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        return auth.decode_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


app = FastAPI(title="Agent API", lifespan=lifespan)

# Allow the React dev server (port 5173) and any localhost origin to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Auth endpoints ---

class AuthRequest(BaseModel):
    email: str
    password: str


@app.post("/auth/register")
def register(req: AuthRequest):
    try:
        user = auth.register(req.email, req.password)
        return {"message": "Registered successfully.", "user": user}
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/login")
def login(req: AuthRequest):
    try:
        token = auth.login(req.email, req.password)
        return {"access_token": token, "token_type": "bearer"}
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail=str(e))


# --- Settings REST endpoint ---

@app.get("/settings")
def get_user_settings_endpoint(authorization: str | None = Header(default=None)):
    user_id = _require_user(authorization)
    with db.cursor() as cur:
        cur.execute("SELECT timezone FROM settings WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
    return {"timezone": row[0] if row else None}


# --- Reminder REST endpoints ---

@app.get("/reminders")
def list_user_reminders(authorization: str | None = Header(default=None)):
    user_id = _require_user(authorization)
    return reminders.get_reminders_list(user_id)


@app.delete("/reminders/{reminder_id}")
def delete_user_reminder(reminder_id: int, authorization: str | None = Header(default=None)):
    user_id = _require_user(authorization)
    result = reminders.delete_reminder(user_id, reminder_id)
    if "No reminder" in result:
        raise HTTPException(status_code=404, detail=result)
    return {"message": result}


# --- WebSocket chat endpoint ---

@app.websocket("/ws")
async def websocket_chat(websocket: WebSocket):
    """
    WebSocket endpoint for the chat UI.

    Connection flow:
      1. Client connects with ?token=<jwt> in the query string
      2. Token is validated; connection rejected on failure
      3. Each message received kicks off a run_turn() call
      4. tool_call, tool_result, and message frames are streamed back in real time
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        user_id = auth.decode_token(token)
    except ValueError as e:
        await websocket.close(code=4003, reason=str(e))
        return

    await websocket.accept()

    # Register this connection so the reminder checker can push notifications
    _connections[user_id] = asyncio.get_running_loop()
    print(f"[ws] connected user={user_id[:8]} total={len(_connections)}", flush=True)

    # Each connection gets its own conversation history seeded with the system prompt
    conversation = [{"role": "system", "content": agent.SYSTEM_PROMPT}]

    async def send(frame: dict):
        """Push a JSON frame to the connected WebSocket client."""
        await websocket.send_text(json.dumps(frame))

    _send_fns[user_id] = send

    async def _ping_loop():
        """Send a WebSocket ping every 30 s; close with 4003 if token has expired."""
        while True:
            await asyncio.sleep(30)
            try:
                auth.decode_token(token)
            except ValueError:
                await websocket.send_text(json.dumps({"type": "session_expired"}))
                await websocket.close(code=4003, reason="Session expired")
                return
            await websocket.send_text(json.dumps({"type": "ping"}))

    ping_task = asyncio.create_task(_ping_loop())

    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
            except (json.JSONDecodeError, AttributeError):
                await send({"type": "error", "content": "Invalid message format. Send {\"message\": \"...\"}"})
                continue

            # Ignore pong frames sent back by the client
            if payload.get("type") == "pong":
                continue

            user_message = payload.get("message", "").strip()
            if not user_message:
                continue

            conversation = await agent.run_turn(
                user_message=user_message,
                history=conversation,
                tools=_tools,
                user_id=user_id,
                send=send,
            )

    except WebSocketDisconnect:
        print(f"[ws] disconnected user={user_id[:8]}", flush=True)
    except Exception as e:
        print(f"[ws] error user={user_id[:8]}: {e}", flush=True)
    finally:
        ping_task.cancel()
        # Only remove if this connection is still the registered one.
        # A newer connection may have already replaced it.
        if _send_fns.get(user_id) is send:
            _connections.pop(user_id, None)
            _send_fns.pop(user_id, None)
        print(f"[ws] cleaned up user={user_id[:8]} remaining={len(_connections)}", flush=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8003, reload=False)
