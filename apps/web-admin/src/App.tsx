import { useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider, useAuth } from "./state/auth";
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
import { PlatformApp } from "./pages/platform/PlatformApp";
import { ProAdminApp } from "./pro/ProAdminApp";

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
      <Route path="*" element={session ? <ProAdminApp /> : <LoginPage />} />
    </Routes>
  );
}

export function App() {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
