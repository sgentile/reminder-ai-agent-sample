import { useState } from "react";
import {
  Box, Button, Container, TextField, Typography,
  Alert, Tabs, Tab, Paper,
} from "@mui/material";
import { useDispatch } from "react-redux";
import { useLoginMutation, useRegisterMutation } from "./authApi";
import { setToken } from "./authSlice";

export default function AuthPage() {
  const dispatch = useDispatch();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [login, { isLoading: loggingIn }] = useLoginMutation();
  const [register, { isLoading: registering }] = useRegisterMutation();

  const isLoading = loggingIn || registering;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      if (tab === "login") {
        const res = await login({ email, password }).unwrap();
        dispatch(setToken(res.access_token));
      } else {
        await register({ email, password }).unwrap();
        setSuccess("Registered! You can now log in.");
        setTab("login");
      }
    } catch (err: unknown) {
      const detail = (err as { data?: { detail?: string } })?.data?.detail;
      setError(detail ?? "Something went wrong.");
    }
  };

  return (
    <Container maxWidth="xs" sx={{ mt: 12 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h5" align="center" gutterBottom>
          Agent
        </Typography>

        <Tabs
          value={tab}
          onChange={(_, v) => { setTab(v); setError(null); setSuccess(null); }}
          centered
          sx={{ mb: 2 }}
        >
          <Tab label="Login" value="login" />
          <Tab label="Register" value="register" />
        </Tabs>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Email" type="email" fullWidth required
            value={email} onChange={(e) => setEmail(e.target.value)}
            margin="normal" autoComplete="email"
          />
          <TextField
            label="Password" type="password" fullWidth required
            value={password} onChange={(e) => setPassword(e.target.value)}
            margin="normal" autoComplete="current-password"
          />
          <Button
            type="submit" fullWidth variant="contained"
            disabled={isLoading} sx={{ mt: 2 }}
          >
            {tab === "login" ? "Login" : "Register"}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}
