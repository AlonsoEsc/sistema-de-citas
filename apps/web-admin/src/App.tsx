import { useMemo } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { theme } from "./theme";
import { AuthProvider, useAuth } from "./state/auth";
import { LoginPage } from "./pages/LoginPage";
import { ProAdminApp } from "./pro/ProAdminApp";

function AppContent() {
  const { session } = useAuth();

  if (!session) {
    return <LoginPage />;
  }

  return <ProAdminApp />;
}

export function App() {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
