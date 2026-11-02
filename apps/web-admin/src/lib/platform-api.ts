import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const STORAGE_KEY = "platform_session";

/**
 * Cliente del panel de plataforma. Su sesion es una cookie httpOnly propia (ruta /platform),
 * separada de la del panel de un negocio. En sessionStorage solo queda quien inicio sesion,
 * para mostrarlo; no hay token.
 */
export const platformApi = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "X-Requested-With": "citas" },
});

export type PlatformSession = {
  user: { id: string; email: string; fullName: string | null };
};

export function readPlatformSession(): PlatformSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PlatformSession) : null;
  } catch {
    return null;
  }
}

export function storePlatformSession(session: PlatformSession | null) {
  if (session) {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ user: session.user } satisfies PlatformSession),
    );
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
