import { useMemo } from "react";
import axios from "axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AdminApp } from "./app/AdminApp";
import { ToastProvider } from "./components/ui/toast";
import { AuthProvider, useAuth } from "./state/auth";
import { ThemeProvider } from "./state/theme";
import { LoginPage } from "./pages/LoginPage";
import {
  ForgotPasswordPage,
  ResetPasswordPage,
} from "./pages/account/PasswordPages";
import { SignupPage } from "./pages/account/SignupPage";
import {
  AcceptInvitationPage,
  VerifyEmailPage,
} from "./pages/account/TokenLinkPages";
import { LegalPage } from "./pages/legal/LegalPage";
import { PlatformApp } from "./pages/platform/PlatformApp";

function AppRoutes() {
  const { session } = useAuth();

  return (
    <Routes>
      <Route path="/plataforma/*" element={<PlatformApp />} />
      <Route
        path="/registro"
        element={session ? <Navigate to="/" replace /> : <SignupPage />}
      />
      <Route path="/recuperar" element={<ForgotPasswordPage />} />
      <Route path="/restablecer" element={<ResetPasswordPage />} />
      <Route path="/verificar-correo" element={<VerifyEmailPage />} />
      <Route path="/invitacion" element={<AcceptInvitationPage />} />
      <Route path="/terminos" element={<LegalPage document="terms" />} />
      <Route path="/privacidad" element={<LegalPage document="privacy" />} />
      <Route path="*" element={session ? <AdminApp /> : <LoginPage />} />
    </Routes>
  );
}

export function App() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          // Un 4xx no mejora reintentando; solo se reintentan fallas de red o del servidor.
          queries: {
            retry: (failureCount, error) =>
              failureCount < 2 &&
              !(
                axios.isAxiosError(error) &&
                (error.response?.status ?? 500) < 500
              ),
            refetchOnWindowFocus: false,
          },
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
