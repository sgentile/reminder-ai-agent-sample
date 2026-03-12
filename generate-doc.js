const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  Header, Footer, PageNumber, LevelFormat, ExternalHyperlink,
  PageBreak
} = require("docx");
const fs = require("fs");

// ── Helpers ──────────────────────────────────────────────────────────────────

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerBorder = { style: BorderStyle.SINGLE, size: 1, color: "2E5F8A" };
const headerBorders = { top: headerBorder, bottom: headerBorder, left: headerBorder, right: headerBorder };

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}
function p(text, opts = {}) {
  return new Paragraph({ children: [new TextRun({ text, ...opts })] });
}
function pb() {
  return new Paragraph({ children: [new PageBreak()] });
}
function spacer() {
  return new Paragraph({ children: [new TextRun("")] });
}
function bullet(text, bold = false) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [new TextRun({ text, bold })],
  });
}
function numbered(text) {
  return new Paragraph({
    numbering: { reference: "numbers", level: 0 },
    children: [new TextRun(text)],
  });
}
function code(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: "Courier New", size: 18, color: "2E5F8A" })],
    indent: { left: 720 },
    spacing: { before: 40, after: 40 },
  });
}
function inlineCode(text) {
  return new TextRun({ text, font: "Courier New", size: 20, color: "2E5F8A" });
}
function pMixed(...runs) {
  return new Paragraph({ children: runs });
}

function twoColTable(rows, col1Width = 3000, col2Width = 6360) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [col1Width, col2Width],
    rows: rows.map(([a, b, isHeader]) =>
      new TableRow({
        children: [
          new TableCell({
            borders: isHeader ? headerBorders : borders,
            width: { size: col1Width, type: WidthType.DXA },
            shading: isHeader
              ? { fill: "2E5F8A", type: ShadingType.CLEAR }
              : { fill: "F5F8FA", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({ text: a, bold: true, color: isHeader ? "FFFFFF" : "000000", font: "Arial", size: isHeader ? 20 : 18 })]
            })],
          }),
          new TableCell({
            borders: isHeader ? headerBorders : borders,
            width: { size: col2Width, type: WidthType.DXA },
            shading: isHeader
              ? { fill: "2E5F8A", type: ShadingType.CLEAR }
              : { fill: "FFFFFF", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({ text: b, color: isHeader ? "FFFFFF" : "000000", font: "Arial", size: isHeader ? 20 : 18 })]
            })],
          }),
        ],
      })
    ),
  });
}

// ── Document ─────────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
      {
        reference: "numbers",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1A3F6F" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "2E5F8A", space: 4 } } },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2E5F8A" },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "444444" },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [new TextRun({ text: "Agent Tutorial — Full-Stack Multi-User AI Agent", font: "Arial", size: 18, color: "888888" })],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 4 } },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: "Page ", font: "Arial", size: 18, color: "888888" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "888888" }),
            new TextRun({ text: " of ", font: "Arial", size: 18, color: "888888" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 18, color: "888888" }),
          ],
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 4 } },
        })],
      }),
    },
    children: [

      // ── Cover ──────────────────────────────────────────────────────────────
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 1440, after: 240 },
        children: [new TextRun({ text: "Agent Tutorial", font: "Arial", size: 72, bold: true, color: "1A3F6F" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 240 },
        children: [new TextRun({ text: "Full-Stack Multi-User AI Agent", font: "Arial", size: 36, color: "2E5F8A" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 1440 },
        children: [new TextRun({ text: "React  \u00B7  FastAPI  \u00B7  PostgreSQL  \u00B7  Ollama  \u00B7  MCP", font: "Arial", size: 24, color: "888888" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "March 12, 2026", font: "Arial", size: 22, color: "AAAAAA" })],
      }),

      pb(),

      // ── 0. Ollama Setup ───────────────────────────────────────────────────
      h1("0. Ollama Setup"),
      p("The agent uses a locally-running LLM served by Ollama. The Docker containers talk to Ollama on your host machine — Ollama itself does NOT run inside Docker."),
      spacer(),

      h2("1. Install Ollama"),
      twoColTable([
        ["Platform", "Command / Instructions", true],
        ["macOS (Homebrew)", "brew install ollama"],
        ["macOS (App)", "Download from ollama.com/download and run the installer."],
        ["Linux", "curl -fsSL https://ollama.com/install.sh | sh"],
        ["Windows", "Download the installer from ollama.com/download."],
      ]),
      spacer(),

      h2("2. Start the Ollama Service"),
      p("Run the following command in a terminal and leave it running:"),
      spacer(),
      code("ollama serve"),
      spacer(),
      p("On macOS, if you installed the desktop app, Ollama starts automatically on login — you can skip this step. Confirm it is running:"),
      spacer(),
      code("curl http://localhost:11434/api/tags"),
      spacer(),
      p("You should receive a JSON response listing available models."),
      spacer(),

      h2("3. Pull a Model"),
      p("The default model is gpt-oss:20b. Pull whichever model you want to use:"),
      spacer(),
      code("# Default (what this project ships with)"),
      code("ollama pull gpt-oss:20b"),
      spacer(),
      code("# Faster alternative — good enough for this domain"),
      code("ollama pull llama3.1:8b"),
      spacer(),
      code("# Larger, higher quality"),
      code("ollama pull llama3.3:70b"),
      spacer(),
      p("Choosing a model: any model with solid tool-calling support works. llama3.1:8b is the fastest option for this use case (simple tools, short conversations). Larger models handle more complex or ambiguous inputs better but are slower."),
      spacer(),

      h2("4. Change the Model (Optional)"),
      p("Edit server/Dockerfile and update the OLLAMA_MODEL line:"),
      spacer(),
      code("ENV OLLAMA_MODEL=llama3.1:8b"),
      spacer(),
      p("Then rebuild: make down && make up"),
      spacer(),

      h2("How the Container Reaches Ollama"),
      p("The server container connects to Ollama on your host machine via host.docker.internal:11434. This is configured automatically:"),
      spacer(),
      twoColTable([
        ["Platform", "How it works", true],
        ["Docker Desktop (Mac / Windows)", "host.docker.internal resolves automatically — no extra configuration needed."],
        ["Linux", "docker-compose.yml includes extra_hosts: host.docker.internal:host-gateway which sets this up automatically."],
      ]),
      spacer(),

      pb(),

      // ── 1. Project Overview ───────────────────────────────────────────────
      h1("1. Project Overview"),
      p("Agent Tutorial is a full-stack, multi-user web application that wraps a local LLM (served by Ollama) in a conversational agent. Users register, log in, and chat with the agent through a React UI. The agent can set reminders, manage per-user settings, and push real-time notifications back to the browser over a persistent WebSocket connection."),
      spacer(),
      p("Everything runs locally inside Docker Compose — no cloud services are required."),
      spacer(),

      h2("Key Capabilities"),
      bullet("Multi-user registration and login with bcrypt password hashing and JWT authentication"),
      bullet("Persistent WebSocket connection per user for streaming agent responses and real-time reminder push"),
      bullet("Recurring and one-shot reminders with per-user storage in PostgreSQL"),
      bullet("Per-user timezone settings that update the live clock in the UI"),
      bullet("MCP (Model Context Protocol) tool server exposing agent tools as a standard interface"),
      bullet("Color-coded recurring reminders in both the chat window and the collapsible sidebar"),
      bullet("Collapsible sidebar with reminder list, next-run countdown, and delete with confirmation"),
      spacer(),

      // ── 2. Architecture ───────────────────────────────────────────────────
      pb(),
      h1("2. Architecture"),

      h2("High-Level Diagram"),
      p("The system has four runtime components, orchestrated by Docker Compose:"),
      spacer(),
      twoColTable([
        ["Component", "Description", true],
        ["Browser (React UI)", "Vite + React + TypeScript + MUI. Connects to the server over WebSocket. Served on port 5173."],
        ["FastAPI Server (api.py)", "HTTP REST + WebSocket server on port 8003. Handles auth, reminder CRUD, and forwards chat messages to the agent."],
        ["MCP Tool Server (mcp_server.py)", "Runs as a subprocess inside the server container on port 8002. Exposes agent tools (reminders, settings, time) via the Model Context Protocol."],
        ["PostgreSQL (db)", "postgres:16-alpine. No host port mapping — reachable only within the Docker network as db:5432."],
      ]),
      spacer(),

      h2("Request Flow — Chat Message"),
      numbered("User types a message; browser sends it over the WebSocket."),
      numbered("api.py receives the frame and calls agent.run_turn() asynchronously."),
      numbered("agent.run_turn() streams tool_call and tool_result frames back to the browser as the LLM reasons."),
      numbered("The LLM calls tools via the MCP client; mcp_server.py executes them against PostgreSQL."),
      numbered("A final message frame is sent to the browser with the agent's reply."),
      spacer(),

      h2("Request Flow — Reminder Push"),
      numbered("reminders._check_loop() runs in a background thread inside api.py (every 5 seconds)."),
      numbered("It queries PostgreSQL for reminders WHERE notified = FALSE AND due_time <= now."),
      numbered("For each due reminder it calls _push_reminder(user_id, text, reminder_id, recurring)."),
      numbered("_push_reminder() looks up the user's asyncio event loop and send function in _connections / _send_fns."),
      numbered("It dispatches a { type: 'reminder', ... } WebSocket frame to the browser using run_coroutine_threadsafe."),
      numbered("For recurring reminders, due_time is advanced to the next interval. For one-shot reminders, notified is set to TRUE."),
      spacer(),

      // ── 3. Project Structure ──────────────────────────────────────────────
      pb(),
      h1("3. Project Structure"),
      twoColTable([
        ["Path", "Purpose", true],
        ["docker-compose.yml", "Orchestrates db, server, and ui services."],
        ["server/src/api.py", "FastAPI app: auth endpoints, WebSocket handler, reminder push, settings endpoint."],
        ["server/src/agent.py", "Async LLM loop: streams tool calls and final messages via a send() callback."],
        ["server/src/mcp_server.py", "MCP tool server: exposes add_reminder, list_reminders, delete_reminder, add_recurring_reminder, get_user_settings, set_timezone, get_current_time."],
        ["server/src/auth.py", "User registration, bcrypt password hashing, JWT creation and validation."],
        ["server/src/db.py", "ThreadedConnectionPool, cursor() context manager, schema creation (CREATE TABLE IF NOT EXISTS)."],
        ["server/src/reminders.py", "Reminder CRUD, _check_loop background thread, notify callback."],
        ["server/src/settings.py", "Timezone get/set with ON CONFLICT DO UPDATE upsert."],
        ["server/Dockerfile", "python:3.12-slim, installs requirements, sets OLLAMA_HOST and OLLAMA_MODEL env vars."],
        ["server/entrypoint.sh", "Starts mcp_server.py in the background, then exec's api.py."],
        ["ui/src/features/chat/ChatPage.tsx", "Main chat page: WebSocket client, sidebar, live clock, reminder color coding, clear chat."],
        ["ui/src/features/reminders/reminderApi.ts", "RTK Query endpoints: getReminders, deleteReminder, getSettings."],
        ["ui/src/app/store.ts", "Redux store with reminderApi reducer and middleware."],
      ], 3500, 5860),
      spacer(),

      // ── 4. Database Schema ────────────────────────────────────────────────
      pb(),
      h1("4. Database Schema"),
      p("All data is stored in PostgreSQL. The schema is created automatically on startup via db.init_db()."),
      spacer(),

      h2("users"),
      twoColTable([
        ["Column", "Type / Notes", true],
        ["id", "UUID PRIMARY KEY — generated by the application at registration time."],
        ["email", "TEXT UNIQUE NOT NULL — used as the login identifier."],
        ["password_hash", "TEXT NOT NULL — bcrypt_sha256 hash via passlib."],
        ["created_at", "TIMESTAMPTZ NOT NULL DEFAULT now()"],
      ]),
      spacer(),

      h2("settings"),
      twoColTable([
        ["Column", "Type / Notes", true],
        ["user_id", "UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE"],
        ["timezone", "TEXT NOT NULL DEFAULT 'UTC' — IANA timezone string (e.g. America/New_York)."],
      ]),
      spacer(),

      h2("reminders"),
      twoColTable([
        ["Column", "Type / Notes", true],
        ["id", "SERIAL PRIMARY KEY"],
        ["user_id", "UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE"],
        ["description", "TEXT NOT NULL"],
        ["due_time", "TIMESTAMPTZ NOT NULL — absolute fire time (UTC stored, displayed in user's timezone)."],
        ["recurring", "BOOLEAN NOT NULL DEFAULT FALSE"],
        ["interval_seconds", "INTEGER — NULL for one-shot reminders."],
        ["notified", "BOOLEAN NOT NULL DEFAULT FALSE — set TRUE after one-shot fires; recurring reminders advance due_time instead."],
      ]),
      spacer(),

      // ── 5. API Reference ──────────────────────────────────────────────────
      pb(),
      h1("5. API Reference"),

      h2("REST Endpoints (port 8003)"),
      twoColTable([
        ["Endpoint", "Description", true],
        ["POST /auth/register", "Body: { email, password }. Creates a new user. Returns { message }."],
        ["POST /auth/login", "Body: { email, password }. Returns { access_token } (JWT, 24 h expiry)."],
        ["GET /settings", "Bearer auth required. Returns { timezone } for the authenticated user."],
        ["GET /reminders", "Bearer auth required. Returns array of all reminders for the authenticated user."],
        ["DELETE /reminders/{id}", "Bearer auth required. Deletes the reminder by ID (must belong to the authenticated user)."],
      ]),
      spacer(),

      h2("WebSocket (ws://localhost:8003/ws)"),
      p("Connect with a ?token=<jwt> query parameter. One connection per user — the server tracks the event loop and send function in _connections / _send_fns."),
      spacer(),

      h3("Client → Server"),
      code('{ "message": "remind me every 30 seconds to stand up" }'),
      spacer(),

      h3("Server → Client Frame Types"),
      twoColTable([
        ["type", "Payload fields", true],
        ["tool_call", "name, args — agent is about to invoke a tool."],
        ["tool_result", "name, result — tool returned a value."],
        ["message", "content — final agent reply text."],
        ["reminder", "content, reminder_id, recurring — reminder fired; reminder_id % 6 determines color."],
        ["ping", "(none) — keepalive sent every 30 s; client ignores."],
        ["session_expired", "(none) — JWT expired; client should log out."],
        ["error", "content — unhandled server error."],
      ]),
      spacer(),

      // ── 6. WebSocket Connection Management ───────────────────────────────
      pb(),
      h1("6. WebSocket Connection Management"),

      h2("Registration and Cleanup"),
      p("When a WebSocket connects, api.py stores the event loop and send coroutine keyed by user_id:"),
      spacer(),
      code("_connections[user_id] = asyncio.get_running_loop()"),
      code("_send_fns[user_id]    = send"),
      spacer(),
      p("On disconnect, the finally block only removes the entry if this connection's send function is still the registered one. This prevents a race condition where React StrictMode (dev) fires the useEffect twice, creating two simultaneous connections for the same user. Without this guard, the first connection's cleanup wipes the second connection's registration, leaving _connections empty."),
      spacer(),
      code("if _send_fns.get(user_id) is send:"),
      code("    _connections.pop(user_id, None)"),
      code("    _send_fns.pop(user_id, None)"),
      spacer(),

      h2("Session Expiry"),
      p("A _ping_loop() coroutine runs per connection. Every 30 seconds it validates the JWT token. If the token has expired, it sends a { type: 'session_expired' } frame, closes the WebSocket with code 4003, and the React UI dispatches logout(), clearing localStorage and redirecting to the login page."),
      spacer(),

      // ── 7. UI Features ────────────────────────────────────────────────────
      pb(),
      h1("7. UI Features"),

      h2("Chat Window"),
      bullet("Streaming agent responses with inline tool call / tool result accordions"),
      bullet("Recurring reminder bubbles are color-coded using a 6-color RGBA palette keyed by reminder_id % 6"),
      bullet("Clear Chat button wipes the local message history (does not affect server state)"),
      spacer(),

      h2("Live Clock"),
      p("Displayed in the chat header. Updates every second using setInterval(1000). When the user sets their timezone via the agent (e.g. \"set my timezone to America/Chicago\"), the UI detects the set_timezone tool_result frame, calls refetchSettings(), and the clock immediately re-renders in the new IANA timezone using Intl.DateTimeFormat with the timeZone option."),
      spacer(),

      h2("Collapsible Sidebar"),
      bullet("Toggle with a hamburger icon; slides open to 280 px with a 0.2 s CSS transition"),
      bullet("Lists all active reminders with description, recurrence interval (e.g. every 60s), and next run time"),
      bullet("Next run time shows seconds: Mar 11, 2:45:30 PM"),
      bullet("Recurring reminders use the same color palette as chat bubbles"),
      bullet("Trash icon on each row opens a MUI confirmation Dialog before deleting"),
      bullet("RTK Query polls GET /reminders every 5 seconds to keep the list current"),
      spacer(),

      // ── 8. Session Summary ────────────────────────────────────────────────
      pb(),
      h1("8. Session Summary (March 11, 2026)"),
      p("The following changes were made during this development session:"),
      spacer(),

      h2("PostgreSQL Migration"),
      p("All per-user data was migrated from flat JSON files to PostgreSQL:"),
      bullet("New db.py module with ThreadedConnectionPool(1, 10) and a cursor() context manager that auto-commits or rolls back"),
      bullet("auth.py, reminders.py, and settings.py rewritten to use db.cursor() — all file I/O removed"),
      bullet("settings.set_timezone uses INSERT ... ON CONFLICT DO UPDATE (upsert) so the first call creates the row and subsequent calls update it"),
      bullet("db.init_db() called in both api.py lifespan and mcp_server.py startup — each OS process needs its own connection pool"),
      bullet("docker-compose.yml updated with a postgres:16-alpine service, pgdata volume, and healthcheck; server depends_on db: condition: service_healthy"),
      bullet("No host port mapping for Postgres — accessible inside Docker as db:5432, and via: docker exec -it agent-tutorial-db-1 psql -U agent"),
      spacer(),

      h2("Timezone Clock"),
      p("A real-time clock was added to the chat header showing the current date and time in the user's IANA timezone (e.g. Mar 11, 3:29:27 PM (America/New_York)). When the agent calls set_timezone, the UI detects the tool_result frame and immediately refetches settings so the clock updates without a page reload."),
      spacer(),

      h2("WebSocket Race Condition Fix"),
      p("Root cause: React StrictMode fires useEffect twice in development, creating two simultaneous WebSocket connections for the same user. The second connection overwrites the first in _connections. When the first connection's finally block runs, it pops the entry — leaving _connections empty even though the second connection is still live."),
      spacer(),
      p("Fix: the finally block now checks if _send_fns.get(user_id) is still this connection's send function before removing the entry. If a newer connection has already registered, cleanup is skipped."),
      spacer(),

      h2("Reminder Checker Race Fix (Earlier Session)"),
      p("mcp_server.py was calling reminders.start_checker() without a notify_fn. The checker ran in both processes, and the mcp_server.py checker was advancing due_time before api.py's checker could call _push_reminder. Fix: start_checker() is only called in api.py's lifespan."),
      spacer(),

      // ── 9. Configuration ──────────────────────────────────────────────────
      pb(),
      h1("9. Configuration"),

      h2("Environment Variables"),
      twoColTable([
        ["Variable", "Default / Notes", true],
        ["OLLAMA_HOST", "http://host.docker.internal:11434 — points to Ollama running on the host machine."],
        ["OLLAMA_MODEL", "gpt-oss:20b — the model name passed to Ollama. Change to switch models (e.g. llama3.1:8b)."],
        ["DATABASE_URL", "postgresql://agent:agent@db:5432/agent — injected by docker-compose; override in server/.env for local dev."],
        ["JWT_SECRET", "Set in server/.env — used to sign and verify JWT tokens."],
        ["VITE_API_URL", "http://localhost:8003 — REST base URL used by the React UI."],
        ["VITE_WS_URL", "ws://localhost:8003/ws — WebSocket URL used by the React UI."],
      ]),
      spacer(),

      h2("Ports"),
      twoColTable([
        ["Port", "Service", true],
        ["5173", "React UI (Vite dev server)"],
        ["8003", "FastAPI / WebSocket server"],
        ["8002", "MCP tool server (internal; exposed for Inspector / debugging)"],
        ["11434", "Ollama (host machine — not in Docker)"],
      ], 2000, 7360),
      spacer(),

      h2("Common Commands"),
      twoColTable([
        ["Command", "Purpose", true],
        ["docker compose up --build", "Build images and start all services."],
        ["docker compose up -d server", "Rebuild and restart only the server container."],
        ["docker compose logs -f server", "Tail server logs."],
        ["docker exec -it agent-tutorial-db-1 psql -U agent", "Open a psql shell inside the database container."],
        ["ollama pull llama3.1:8b", "Download an alternative model for faster responses."],
      ]),
      spacer(),

    ],
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("agent-tutorial.docx", buffer);
  console.log("Written: agent-tutorial.docx");
});
