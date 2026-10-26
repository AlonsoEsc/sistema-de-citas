import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, onUnauthorized } from "../lib/api";

type SessionUser = {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
};

/**
 * Sesion del panel. El token vive en una cookie httpOnly que el navegador envia solo; aqui
 * se guarda unicamente lo necesario para pintar la interfaz (usuario y negocio).
 */
export type UserSession = {
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  user: SessionUser;
};

type LoginInput = {
  email: string;
  password: string;
  tenantSlug: string;
};

type AuthContextValue = {
  session: UserSession | null;
  login: (input: LoginInput) => Promise<void>;
  /** Abre sesion con la respuesta de registro o de aceptar una invitacion. */
  startSession: (session: UserSession) => void;
  logout: () => void;
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "citas_admin_session";

function writeStoredSession(session: UserSession | null) {
  try {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Sin almacenamiento, la sesion sigue en memoria hasta recargar.
  }
}

function readStoredSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as UserSession & { token?: unknown })
      : null;
    if (!parsed || !Array.isArray(parsed.user?.permissions)) {
      return null;
    }
    // Versiones anteriores guardaban el token aqui: se descarta.
    const { tenant, user } = parsed;
    return { tenant, user };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(readStoredSession);

  const clear = useCallback(() => {
    setSession(null);
    writeStoredSession(null);
  }, []);

  const logout = useCallback(() => {
    // La cookie es httpOnly: solo la API puede borrarla.
    void api.post("/auth/logout").catch(() => undefined);
    clear();
  }, [clear]);

  const startSession = useCallback((next: UserSession) => {
    const stored = { tenant: next.tenant, user: next.user };
    setSession(stored);
    writeStoredSession(stored);
  }, []);

  useEffect(() => onUnauthorized(clear), [clear]);

  // Al recargar, confirma con la API que la cookie sigue vigente y refresca permisos.
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) {
      return;
    }
    api
      .get<{ user: SessionUser }>("/auth/me")
      .then((response) => {
        setSession((current) => {
          if (!current) {
            return current;
          }
          const next = { ...current, user: response.data.user };
          writeStoredSession(next);
          return next;
        });
      })
      .catch(() => undefined);
  }, [userId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      async login(input) {
        const response = await api.post<UserSession>("/auth/login", input);
        startSession(response.data);
      },
      startSession,
      logout,
      can(permission) {
        return session?.user.permissions.includes(permission) ?? false;
      },
    }),
    [session, logout, startSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
