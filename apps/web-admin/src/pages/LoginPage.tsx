import { useState } from "react";
import { Alert, Box, Button, Container, Paper, Stack, TextField, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { useAuth } from "../state/auth";

export function LoginPage() {
  const { login } = useAuth();
  // Las credenciales demo solo se precargan en desarrollo, nunca en el build de produccion.
  const [email, setEmail] = useState(import.meta.env.DEV ? "admin@demo.com" : "");
  const [password, setPassword] = useState(import.meta.env.DEV ? "Admin1234!" : "");
  const [tenantSlug, setTenantSlug] = useState(import.meta.env.DEV ? "demo-barberia" : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await login({ email, password, tenantSlug });
    } catch {
      setError("No se pudo iniciar sesión. Revisa credenciales y tenant.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at 10% 15%, rgba(20,184,166,0.25), transparent 32%), radial-gradient(circle at 90% 85%, rgba(234,88,12,0.22), transparent 40%), #F6F9F8"
      }}
    >
      <Container maxWidth="sm">
        <Paper
          component={motion.form}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={submit}
          sx={{ p: 4, borderRadius: 5 }}
        >
          <Typography variant="h4">Panel Administrativo</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            SaaS de citas para barberías, salones y clínicas.
          </Typography>

          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Tenant slug" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
            <TextField label="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField
              type="password"
              label="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? "Ingresando..." : "Entrar al sistema"}
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
