import { useEffect, useRef, useState } from "react";
import {
  AppBar, Box, Button, Chip, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  IconButton, InputAdornment, List, ListItem, ListItemText,
  Paper, TextField, Toolbar, Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import DeleteIcon from "@mui/icons-material/Delete";
import MenuIcon from "@mui/icons-material/Menu";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../../app/store";
import { logout } from "../auth/authSlice";
import { useGetRemindersQuery, useDeleteReminderMutation, useGetSettingsQuery } from "../reminders/reminderApi";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8001/ws";
const SIDEBAR_WIDTH = 280;

// Light transparent colors for recurring reminder groups — readable with black text
const RECURRING_COLORS = [
  "rgba(173, 216, 230, 0.45)", // light blue
  "rgba(144, 238, 144, 0.45)", // light green
  "rgba(255, 218, 185, 0.45)", // peach
  "rgba(221, 160, 221, 0.45)", // lavender
  "rgba(255, 255, 153, 0.45)", // light yellow
  "rgba(255, 182, 193, 0.45)", // light pink
];

function recurringBg(id: number): string {
  return RECURRING_COLORS[id % RECURRING_COLORS.length];
}

function fmtInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(seconds / 3600)}h`;
}

interface Frame {
  type: "message" | "tool_call" | "tool_result" | "error" | "reminder" | "ping" | "session_expired";
  content?: string;
  name?: string;
  result?: string;
  reminder_id?: number;
  recurring?: boolean;
}

interface ChatMessage {
  id: number;
  role: "user" | "agent" | "tool" | "reminder";
  text: string;
  isThinking?: boolean;
  reminderId?: number;
  recurring?: boolean;
}

let msgId = 0;

export default function ChatPage() {
  const dispatch = useDispatch();
  const token = useSelector((s: RootState) => s.auth.token);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: remindersData, refetch: refetchReminders } = useGetRemindersQuery(undefined, {
    pollingInterval: 5000,
  });
  const [deleteReminder] = useDeleteReminderMutation();
  const { data: settingsData, refetch: refetchSettings } = useGetSettingsQuery();
  const userTz = settingsData?.timezone ?? undefined;

  const [clockNow, setClockNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const frame: Frame = JSON.parse(event.data);
      if (frame.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (frame.type === "session_expired") {
        dispatch(logout());
        return;
      }
      setMessages((prev) => {
        const withoutThinking = prev.filter((m) => !m.isThinking);

        if (frame.type === "tool_call") {
          return [...withoutThinking, {
            id: ++msgId, role: "tool",
            text: `Using ${frame.name}…`,
            isThinking: true,
          }];
        }
        if (frame.type === "tool_result") {
          if (frame.name?.includes("reminder")) refetchReminders();
          if (frame.name === "set_timezone") refetchSettings();
          return [...withoutThinking, {
            id: ++msgId, role: "tool",
            text: `${frame.name}: ${frame.result}`,
          }];
        }
        if (frame.type === "message") {
          return [...withoutThinking, { id: ++msgId, role: "agent", text: frame.content ?? "" }];
        }
        if (frame.type === "error") {
          return [...withoutThinking, { id: ++msgId, role: "agent", text: `Error: ${frame.content}` }];
        }
        if (frame.type === "reminder") {
          return [...prev, {
            id: ++msgId, role: "reminder",
            text: frame.content ?? "",
            reminderId: frame.reminder_id,
            recurring: frame.recurring,
          }];
        }
        return prev;
      });
    };

    return () => ws.close();
  }, [refetchReminders, token]);

  const send = () => {
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setMessages((prev) => [
      ...prev,
      { id: ++msgId, role: "user", text },
      { id: ++msgId, role: "agent", text: "Thinking…", isThinking: true },
    ]);
    wsRef.current.send(JSON.stringify({ message: text }));
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const confirmDelete = async () => {
    if (deleteTarget !== null) {
      await deleteReminder(deleteTarget);
      setDeleteTarget(null);
    }
  };

  const activeReminders = remindersData?.filter((r) => !r.notified) ?? [];
  const deleteTargetReminder = activeReminders.find((r) => r.id === deleteTarget);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar position="static" elevation={1}>
        <Toolbar>
          <IconButton color="inherit" onClick={() => setSidebarOpen((o) => !o)} sx={{ mr: 1 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Agent</Typography>
          <Chip
            label={connected ? "Connected" : "Disconnected"}
            color={connected ? "success" : "error"}
            size="small" sx={{ mr: 2 }}
          />
          <Button color="inherit" onClick={() => dispatch(logout())}>Logout</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <Box sx={{
          width: sidebarOpen ? SIDEBAR_WIDTH : 0,
          minWidth: sidebarOpen ? SIDEBAR_WIDTH : 0,
          overflow: "hidden",
          transition: "width 0.2s, min-width 0.2s",
          borderRight: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper",
        }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
            <Typography variant="subtitle2" fontWeight="bold">
              Reminders{activeReminders.length > 0 ? ` (${activeReminders.length})` : ""}
            </Typography>
          </Box>
          <List dense disablePadding sx={{ flexGrow: 1, overflowY: "auto" }}>
            {activeReminders.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                No active reminders
              </Typography>
            ) : activeReminders.map((r) => (
              <ListItem
                key={r.id}
                disablePadding
                sx={{
                  px: 1, py: 0.5,
                  bgcolor: r.recurring ? recurringBg(r.id) : undefined,
                  "&:hover": { filter: "brightness(0.96)" },
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => setDeleteTarget(r.id)}
                  sx={{ mr: 0.5, color: "error.light", flexShrink: 0 }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
                <ListItemText
                  primary={`${r.recurring ? "🔁" : "🔔"} ${r.description}`}
                  secondary={
                    <Box component="span" sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                      {r.recurring && r.interval_seconds != null && (
                        <Typography component="span" variant="caption" color="text.secondary">
                          every {fmtInterval(r.interval_seconds)}
                        </Typography>
                      )}
                      <Typography component="span" variant="caption" color="text.disabled">
                        next: {new Date(r.due_time).toLocaleString([], {
                          month: "short", day: "numeric",
                          hour: "numeric", minute: "2-digit", second: "2-digit",
                        })}
                      </Typography>
                    </Box>
                  }
                  primaryTypographyProps={{ variant: "body2", noWrap: true }}
                />
              </ListItem>
            ))}
          </List>
        </Box>

        {/* Chat area */}
        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 2, pt: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {clockNow.toLocaleString([], {
                ...(userTz && { timeZone: userTz }),
                month: "short", day: "numeric",
                hour: "numeric", minute: "2-digit", second: "2-digit",
              })}
              {" ("}
              {clockNow.toLocaleTimeString([], {
                ...(userTz && { timeZone: userTz }),
                timeZoneName: "short",
              }).split(" ").at(-1)}
              {")"}
            </Typography>
            <IconButton
              size="small"
              onClick={() => setMessages([])}
              title="Clear chat"
              sx={{ color: "text.disabled", "&:hover": { color: "text.secondary" } }}
            >
              <ClearAllIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ flexGrow: 1, overflowY: "auto", px: 2, pb: 2 }}>
            <Container maxWidth="md">
              {messages.map((msg) => {
                const bg =
                  msg.role === "user" ? undefined :
                  msg.role === "tool" ? "grey.100" :
                  msg.role === "reminder"
                    ? (msg.recurring && msg.reminderId != null
                        ? recurringBg(msg.reminderId)
                        : "rgba(255, 193, 7, 0.25)")
                    : "background.paper";

                return (
                  <Box
                    key={msg.id}
                    sx={{
                      display: "flex",
                      justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                      mb: 1,
                    }}
                  >
                    <Paper
                      elevation={1}
                      sx={{
                        px: 2, py: 1, maxWidth: "75%",
                        bgcolor: msg.role === "user" ? "primary.main" : bg,
                        color: msg.role === "user" ? "primary.contrastText" : "text.primary",
                        borderRadius: msg.role === "user"
                          ? "16px 16px 4px 16px"
                          : "16px 16px 16px 4px",
                      }}
                    >
                      {msg.role === "tool" && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          tool
                        </Typography>
                      )}
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {msg.isThinking && <CircularProgress size={12} />}
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                          {msg.text}
                        </Typography>
                      </Box>
                    </Paper>
                  </Box>
                );
              })}
              <div ref={bottomRef} />
            </Container>
          </Box>

          <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
            <Container maxWidth="md">
              <TextField
                fullWidth multiline maxRows={4}
                placeholder="Message the agent…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={send} disabled={!connected || !input.trim()}>
                        <SendIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Container>
          </Box>
        </Box>
      </Box>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete reminder?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTargetReminder?.description ?? ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
