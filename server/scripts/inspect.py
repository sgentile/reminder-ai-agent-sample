"""
inspect.py — connects to the running MCP server and lists all available tools.

Usage:
    python scripts/inspect.py
    python scripts/inspect.py --call list_reminders
"""
import asyncio
import argparse
import json
import os
import sys

from fastmcp import Client

MCP_URL = os.environ.get("MCP_URL", "http://localhost:8002/mcp")


async def list_tools(mcp: Client) -> None:
    tools = await mcp.list_tools()
    print(f"\n{len(tools)} tools on {MCP_URL}:\n")
    for t in tools:
        print(f"  {t.name}")
        if t.description:
            print(f"    {t.description}")
        props = t.inputSchema.get("properties", {})
        if props:
            for param, meta in props.items():
                print(f"    • {param} ({meta.get('type', '?')}): {meta.get('description', '')}")
        print()


async def call_tool(mcp: Client, name: str, args: dict) -> None:
    print(f"\nCalling {name} with {args}...\n")
    result = await mcp.call_tool(name, args)
    print(result[0].text if result else "(no result)")


async def main(tool_name: str | None, args: dict) -> None:
    async with Client(MCP_URL) as mcp:
        if tool_name:
            await call_tool(mcp, tool_name, args)
        else:
            await list_tools(mcp)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect the MCP server")
    parser.add_argument("--call", metavar="TOOL", help="Tool name to call")
    parser.add_argument("--args", metavar="JSON", default="{}", help='Tool args as JSON, e.g. \'{"reminder_id": 1}\'')
    parsed = parser.parse_args()

    try:
        args = json.loads(parsed.args)
    except json.JSONDecodeError as e:
        print(f"Invalid JSON for --args: {e}")
        sys.exit(1)

    asyncio.run(main(parsed.call, args))
