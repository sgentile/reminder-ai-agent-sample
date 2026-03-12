import { useSelector } from "react-redux";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import type { RootState } from "./app/store";
import AuthPage from "./features/auth/AuthPage";
import ChatPage from "./features/chat/ChatPage";

const theme = createTheme({
  palette: { mode: "light" },
});

export default function App() {
  const token = useSelector((s: RootState) => s.auth.token);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {token ? <ChatPage /> : <AuthPage />}
    </ThemeProvider>
  );
}
