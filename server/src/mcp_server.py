import math
import os
import sys
from datetime import datetime

# Ensure src/ siblings (reminders.py, settings.py) are importable
sys.path.insert(0, os.path.dirname(__file__))

from fastmcp import FastMCP
import db
import reminders
import settings

# FastMCP creates the server and handles all MCP protocol details.
# The name appears in tool listings when clients connect and inspect this server.
mcp = FastMCP("reminder-agent")

# Each @mcp.tool() decorated function becomes a discoverable, callable tool.
# FastMCP reads the function signature and docstring to build the tool schema
# automatically — no need to write JSON schemas by hand.

# user_id is injected by the agent from the authenticated session — the LLM never sees it.
# It namespaces all data under data/{user_id}/ so each user's reminders and settings
# are fully isolated.

@mcp.tool()
def get_user_settings(user_id: str) -> str:
    """Return saved user preferences including timezone."""
    return settings.get_user_settings(user_id)


@mcp.tool()
def set_timezone(user_id: str, timezone: str) -> str:
    """Save the user's IANA timezone (e.g. America/New_York)."""
    return settings.set_timezone(user_id, timezone)


@mcp.tool()
def get_current_time(user_id: str) -> str:
    """Return the current local time in ISO 8601 format."""
    local_tz = settings.get_tz(user_id)
    return datetime.now(local_tz).strftime("%Y-%m-%dT%H:%M:%S%z")


@mcp.tool()
def calculate(expression: str) -> str:
    """Evaluate a math expression. Supports sqrt, sin, cos, pi, etc."""
    allowed = {k: v for k, v in math.__dict__.items() if not k.startswith("_")}
    allowed.update({"abs": abs, "round": round})
    try:
        return str(eval(expression, {"__builtins__": {}}, allowed))  # noqa: S307
    except Exception as e:
        return f"Error: {e}"


@mcp.tool()
def add_reminder(user_id: str, description: str, due_time: str) -> str:
    """Save a one-time reminder. due_time must be ISO 8601 with UTC offset, e.g. 2026-03-11T10:00:00-05:00."""
    return reminders.add_reminder(user_id, description, due_time)


@mcp.tool()
def add_recurring_reminder(user_id: str, description: str, start_time: str, interval_seconds: int) -> str:
    """Save a recurring reminder. start_time is ISO 8601 with offset. interval_seconds sets how often it repeats."""
    return reminders.add_recurring_reminder(user_id, description, start_time, interval_seconds)


@mcp.tool()
def list_reminders(user_id: str) -> str:
    """List all pending reminders displayed in the user's local timezone."""
    return reminders.list_reminders(user_id)


@mcp.tool()
def delete_reminder(user_id: str, reminder_id: int) -> str:
    """Delete a reminder by its numeric ID."""
    return reminders.delete_reminder(user_id, reminder_id)


if __name__ == "__main__":
    # Note: reminder checker runs in api.py (not here) so it can push WebSocket
    # notifications to connected clients. mcp_server.py only owns tool implementations.
    db.init_db()

    # streamable-http exposes the MCP server over HTTP on port 8002.
    # The agent connects to http://localhost:8002/mcp to discover and call tools.
    # No auth is needed here — the port is only reachable from your local machine.
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8002)
