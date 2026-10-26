import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const STORAGE_KEY = "platform_session";

/**
 * Cliente del panel de plataforma. Usa su propia sesion (sessionStorage: se borra al cerrar
 * el navegador) y nunca comparte el token con el panel de un negocio.
 */
export const platformApi = axios.create({ baseURL: API_URL });

export type PlatformSession = {
  token: string;
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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

platformApi.interceptors.request.use((config) => {
  const session = readPlatformSession();
  if (session) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  return config;
});
