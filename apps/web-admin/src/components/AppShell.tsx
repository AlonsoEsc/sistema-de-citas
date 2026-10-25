import { Box, Button, Container, Stack, Typography } from "@mui/material";
import DashboardRounded from "@mui/icons-material/DashboardRounded";
import CalendarMonthRounded from "@mui/icons-material/CalendarMonthRounded";
import GroupRounded from "@mui/icons-material/GroupRounded";
import InsightsRounded from "@mui/icons-material/InsightsRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useAuth } from "../state/auth";

type NavKey = "dashboard" | "calendar" | "catalog" | "reports" | "settings";

type AppShellProps = {
  current: NavKey;
  onNavigate: (key: NavKey) => void;
  children: ReactNode;
};

const navItems: Array<{ key: NavKey; label: string; icon: ReactNode }> = [
  { key: "dashboard", label: "Resumen", icon: <DashboardRounded fontSize="small" /> },
  { key: "calendar", label: "Agenda", icon: <CalendarMonthRounded fontSize="small" /> },
  { key: "catalog", label: "Catálogos", icon: <GroupRounded fontSize="small" /> },
  { key: "reports", label: "Reportes", icon: <InsightsRounded fontSize="small" /> },
  { key: "settings", label: "Ajustes", icon: <SettingsRounded fontSize="small" /> }
];

export function AppShell({ children, current, onNavigate }: AppShellProps) {
  const { session, logout } = useAuth();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 8% 12%, rgba(20,184,166,0.2), transparent 35%), radial-gradient(circle at 92% 10%, rgba(234,88,12,0.18), transparent 30%), #F6F9F8",
        py: 2
      }}
    >
      <Container maxWidth="xl">
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <Stack
            component={motion.aside}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            sx={{
              width: { xs: "100%", md: 280 },
              bgcolor: "rgba(255,255,255,0.88)",
              backdropFilter: "blur(12px)",
              borderRadius: 4,
              p: 2,
              border: "1px solid rgba(15,118,110,0.15)"
            }}
            spacing={2}
          >
            <Box>
              <Typography variant="h5">Agenda Pro</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                {session?.tenant.name}
              </Typography>
            </Box>

            {navItems.map((item) => (
              <Button
                key={item.key}
                startIcon={item.icon}
                onClick={() => onNavigate(item.key)}
                variant={current === item.key ? "contained" : "text"}
                color={current === item.key ? "primary" : "inherit"}
                sx={{
                  justifyContent: "flex-start",
                  color: current === item.key ? "#fff" : "text.primary"
                }}
              >
                {item.label}
              </Button>
            ))}

            <Box sx={{ mt: "auto", pt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {session?.user.email}
              </Typography>
              <Button color="secondary" variant="outlined" sx={{ mt: 1 }} fullWidth onClick={logout}>
                Cerrar sesión
              </Button>
            </Box>
          </Stack>

          <Box flex={1}>{children}</Box>
        </Stack>
      </Container>
    </Box>
  );
}
