import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, onUnauthorized, setAuthToken } from "../lib/api";

type SessionUser = {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
};

type UserSession = {
  token: string;
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
  logout: () => void;
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "citas_admin_session";

function readStoredSession(): UserSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as UserSession;
    if (!parsed.token || !Array.isArray(parsed.user?.permissions)) {
      throw new Error("Sesion con formato anterior");
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(() => {
    const stored = readStoredSession();
    setAuthToken(stored?.token);
    return stored;
  });

  const logout = useCallback(() => {
    setSession(null);
    setAuthToken(undefined);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => onUnauthorized(logout), [logout]);

  // Al recargar, confirma que el token sigue vigente y refresca roles/permisos.
  const storedToken = session?.token;
  useEffect(() => {
    if (!storedToken) {
      return;
    }
    api
      .get<{ user: SessionUser }>("/auth/me")
      .then((response) => {
        setSession((current) => {
          if (!current || current.token !== storedToken) {
            return current;
          }
          const next = { ...current, user: response.data.user };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          return next;
        });
      })
      .catch(() => undefined);
  }, [storedToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      async login(input) {
        const response = await api.post<UserSession>("/auth/login", input);
        setSession(response.data);
        setAuthToken(response.data.token);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(response.data));
      },
      logout,
      can(permission) {
        return session?.user.permissions.includes(permission) ?? false;
      },
    }),
    [session, logout],
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
