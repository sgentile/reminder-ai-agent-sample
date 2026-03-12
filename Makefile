MCP_URL = http://localhost:8002/mcp

# ── Docker Compose (primary workflow) ─────────────────────────────────────────

up: ui-lint
	docker compose up -d --build

ui-lint:
	cd ui && npm run lint

down:
	docker compose down

logs:
	docker compose logs -f

# ── UI (local dev without Docker) ─────────────────────────────────────────────

ui-install:
	cd ui && npm install

ui-dev:
	cd ui && npm run dev

ui-build:
	cd ui && npm run build

# ── Server (local dev without Docker) ─────────────────────────────────────────

server-dev:
	cd server && python src/api.py

# ── MCP Inspector ─────────────────────────────────────────────────────────────

# Opens the MCP Inspector in your browser with transport and URL pre-filled.
# Requires the server to be running (make up or make server-dev).
mcp-inspector:
	npx @modelcontextprotocol/inspector --url $(MCP_URL) --transport streamable-http

.PHONY: up down logs ui-install ui-lint ui-dev ui-build server-dev mcp-inspector
