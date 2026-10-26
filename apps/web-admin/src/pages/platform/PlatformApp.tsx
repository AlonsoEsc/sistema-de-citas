import { useEffect, useState, type FormEvent } from "react";
import { Route, Routes, useNavigate } from "react-router";
import {
  Alert,
  AuthLayout,
  Field,
  PrimaryButton,
} from "../../components/ui/form";
import { apiErrorMessage } from "../../lib/errors";
import {
  platformApi,
  readPlatformSession,
  storePlatformSession,
  type PlatformSession,
} from "../../lib/platform-api";
import { PlatformTenantPage } from "./PlatformTenantPage";
import { PlatformTenantsPage } from "./PlatformTenantsPage";

function PlatformLogin({
  onLogin,
}: {
  onLogin: (session: PlatformSession) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const response = await platformApi.post<PlatformSession>(
        "/platform/auth/login",
        { email, password },
      );
      onLogin(response.data);
    } catch (err) {
      setError(apiErrorMessage(err, "Credenciales inválidas."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Plataforma" subtitle="Acceso exclusivo para operadores.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field
          label="Correo"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          required
        />
        <Field
          label="Contraseña"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <PrimaryButton loading={loading}>Entrar</PrimaryButton>
      </form>
    </AuthLayout>
  );
}

/** Panel de la plataforma: negocios, suscripciones y pagos. */
export function PlatformApp() {
  const [session, setSession] = useState(readPlatformSession);
  const navigate = useNavigate();

  const logout = () => {
    storePlatformSession(null);
    setSession(null);
  };

  // Una sesion vencida (2 h) devuelve al login de plataforma.
  useEffect(() => {
    const id = platformApi.interceptors.response.use(undefined, (error) => {
      if (error?.response?.status === 401) {
        logout();
      }
      return Promise.reject(error);
    });
    return () => platformApi.interceptors.response.eject(id);
  }, []);

  if (!session) {
    return (
      <PlatformLogin
        onLogin={(next) => {
          storePlatformSession(next);
          setSession(next);
          navigate("/plataforma");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate("/plataforma")}
            className="text-sm font-bold text-slate-900"
          >
            Plataforma
          </button>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span>{session.user.email}</span>
            <button
              type="button"
              onClick={logout}
              className="font-medium text-indigo-600 hover:text-indigo-700"
            >
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route index element={<PlatformTenantsPage />} />
          <Route path="negocios/:tenantId" element={<PlatformTenantPage />} />
        </Routes>
      </main>
    </div>
  );
}
