#!/bin/sh
set -e

# Start the MCP server in the background.
# It owns all tool logic: reminders, settings, time, and math.
python src/mcp_server.py &

# Wait until the MCP server is accepting connections on port 8002.
echo "Waiting for MCP server..."
until python -c "import socket; s=socket.socket(); s.connect(('localhost', 8002)); s.close()" 2>/dev/null; do
    sleep 1
done
echo "MCP server ready."

# Start the FastAPI server in the foreground.
# It handles auth, WebSocket chat, and calls into the MCP server for tool execution.
exec python src/api.py
