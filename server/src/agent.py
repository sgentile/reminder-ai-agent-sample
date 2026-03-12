import asyncio
import json
import os
import re

import ollama
from fastmcp import Client

MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

# URL of the MCP server. The /mcp path is FastMCP's default endpoint.
# In Docker this points to localhost because both processes share the container.
MCP_URL = os.environ.get("MCP_URL", "http://localhost:8002/mcp")

client = ollama.Client(host=OLLAMA_HOST)

# The system prompt tells the model the rules for using tools and time zones.
# Tool names and descriptions are intentionally kept here too — they guide the
# model's reasoning even though the actual schemas are fetched from the MCP server.
SYSTEM_PROMPT = """\
You are a helpful assistant with access to tools.

To call a tool, output EXACTLY this format on its own lines — nothing before or after:
TOOL: <tool_name>
ARGS: <json object>

Wait for the tool result before continuing. After receiving it, either call
another tool or give your final answer to the user.

Available tools:
- get_user_settings()
    Returns saved user preferences including timezone.
- set_timezone(timezone: str)
    Saves the user's IANA timezone (e.g. "America/New_York"). Call this when
    the user tells you their timezone or asks to update it.
- get_current_time()
    Returns the current local time in ISO 8601 format. Only accurate after
    timezone is set.
- add_reminder(description: str, due_time: str)
    Saves a one-time reminder. due_time must be ISO 8601 with offset (e.g. 2026-03-11T10:00:00-05:00).
- add_recurring_reminder(description: str, start_time: str, interval_seconds: int)
    Saves a recurring reminder that fires repeatedly. start_time is ISO 8601 with offset.
    interval_seconds is how often it repeats (e.g. 60 = every minute, 3600 = every hour).
- list_reminders()
    Lists all pending reminders in the user's local timezone.
- delete_reminder(reminder_id: int)
    Deletes a reminder by its numeric ID.
- calculate(expression: str)
    Evaluates a math expression (supports sqrt, sin, etc.).

Rules:
1. Before adding any reminder, call get_user_settings to check if timezone is set.
   - If not set: ask the user "What timezone are you in?" and wait for their reply,
     then call set_timezone before proceeding.
   - If set: proceed directly.
2. Always call get_current_time after confirming timezone, so you know the current time
   before computing a relative due time like "in 30 minutes" or "at 10am".
3. For recurring reminders, use add_recurring_reminder. Choose a sensible start_time
   (e.g. immediately or next occurrence) and set interval_seconds appropriately
   (60 = every minute, 3600 = every hour, 86400 = every day).
"""

# Regex for parsing ReAct-style tool calls from plain text responses.
# Matches: TOOL: tool_name\nARGS: {...}
# re.DOTALL allows the JSON block to span multiple lines.
TOOL_RE = re.compile(r"TOOL:\s*(\w+)\s*\nARGS:\s*(\{.*?\})", re.DOTALL)


async def _fetch_tools() -> list:
    """
    Ask the MCP server what tools it exposes and convert them to Ollama format.

    This replaces the hardcoded TOOLS list from the previous version.
    The agent now discovers tools dynamically at startup — if the server adds
    or changes a tool, the agent picks it up without any code changes here.
    """
    async with Client(MCP_URL) as mcp:
        tools = await mcp.list_tools()

    # Convert MCP tool schema → Ollama tool schema
    # MCP uses inputSchema (JSON Schema); Ollama uses the same format under "parameters"
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description or "",
                "parameters": t.inputSchema,
            },
        }
        for t in tools
    ]


async def _call_mcp(tool_name: str, args: dict) -> str:
    """
    Call a tool on the MCP server. Now fully async — no asyncio.run() needed
    since run_turn() and the FastAPI WebSocket handler share one event loop.
    """
    async with Client(MCP_URL) as mcp:
        result = await mcp.call_tool(tool_name, args)
        if not result or not result.content:
            return "(no result)"
        return result.content[0].text


async def _execute_tool(name: str, args: dict, send=None) -> str:
    """
    Execute a tool via MCP and optionally stream progress frames to the caller.

    send is an async callable used by the WebSocket handler to push
    tool_call and tool_result frames to the client in real time.
    When running in CLI mode send is None, so we just print instead.
    """
    if send:
        await send({"type": "tool_call", "name": name, "args": args})
    else:
        print(f"  [tool] {name}({args})")

    result = await _call_mcp(name, args)

    if send:
        await send({"type": "tool_result", "name": name, "result": result})
    else:
        print(f"  [result] {result}")

    return result


async def run_turn(
    user_message: str,
    history: list,
    tools: list,
    user_id: str,
    send=None,
) -> list:
    """
    Run one user turn through the agentic loop.

    user_id is injected into every user-scoped tool call so the MCP server
    can namespace data under data/{user_id}/ without the LLM knowing about it.

    send(frame) is an async callback used in WebSocket mode to stream
    tool_call, tool_result, and message frames to the client as they happen.
    In CLI mode send is None and output goes to stdout instead.

    The loop has three cases each iteration:
      1. Native tool call  — model returns structured tool_calls → execute via MCP
      2. ReAct text call   — model outputs TOOL:/ARGS: text → execute via MCP
      3. Final answer      — no tool call detected, stream/print and exit loop
    """
    history.append({"role": "user", "content": user_message})

    # Tools that need a user context — user_id is injected automatically
    USER_SCOPED_TOOLS = {
        "get_user_settings", "set_timezone", "get_current_time",
        "add_reminder", "add_recurring_reminder", "list_reminders", "delete_reminder",
    }

    while True:
        # Full history sent every call — model has no memory of its own
        response = client.chat(model=MODEL, messages=history, tools=tools)
        msg = response.message
        content = msg.content or ""

        # Case 1: Native tool calls (OpenAI-style structured output)
        if msg.tool_calls:
            history.append(msg)
            for call in msg.tool_calls:
                args = dict(call.function.arguments or {})
                if call.function.name in USER_SCOPED_TOOLS:
                    args["user_id"] = user_id
                result = await _execute_tool(call.function.name, args, send)
                history.append({"role": "tool", "content": result})
            continue

        # Case 2: ReAct fallback — tool call written as plain text
        match = TOOL_RE.search(content)
        if match:
            history.append({"role": "assistant", "content": content})
            tool_name = match.group(1)
            try:
                args = json.loads(match.group(2))
            except json.JSONDecodeError:
                args = {}
            if tool_name in USER_SCOPED_TOOLS:
                args["user_id"] = user_id
            result = await _execute_tool(tool_name, args, send)
            history.append({"role": "user", "content": f"Tool result: {result}"})
            continue

        # Case 3: Final answer
        history.append({"role": "assistant", "content": content})
        if send:
            await send({"type": "message", "content": content})
        else:
            print(f"Agent: {content}" if content.strip() else "Agent: (no response)")
        break

    return history


if __name__ == "__main__":
    import sys

    # CLI mode — uses a placeholder user_id since there's no auth in terminal
    CLI_USER_ID = os.environ.get("CLI_USER_ID", "cli-user")

    async def cli_main():
        print(f"Connecting to MCP server at {MCP_URL}...")
        tools = await _fetch_tools()
        print(f"Loaded {len(tools)} tools: {[t['function']['name'] for t in tools]}\n")
        print(f"Agent ready (model: {MODEL}, user: {CLI_USER_ID}). Type 'quit' to exit.\n")

        conversation = [{"role": "system", "content": SYSTEM_PROMPT}]
        while True:
            try:
                user_input = input("You: ").strip()
            except EOFError:
                break
            if not user_input:
                continue
            if user_input.lower() in ("quit", "exit"):
                break
            conversation = await run_turn(user_input, conversation, tools, CLI_USER_ID)

    asyncio.run(cli_main())
