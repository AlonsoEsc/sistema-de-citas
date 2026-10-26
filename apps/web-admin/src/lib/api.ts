import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/**
 * Cliente del panel. La sesion viaja en una cookie httpOnly que pone la API (el token
 * nunca queda al alcance del JavaScript). El encabezado X-Requested-With es la defensa
 * anti-CSRF que la API exige en las escrituras.
 */
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "X-Requested-With": "citas" },
});

// Cierra la sesion cuando la API responde 401 (sesion vencida o revocada).
export function onUnauthorized(handler: () => void) {
  const interceptorId = api.interceptors.response.use(undefined, (error) => {
    const isLogin = error?.config?.url === "/auth/login";
    if (error?.response?.status === 401 && !isLogin) {
      handler();
    }
    return Promise.reject(error);
  });
  return () => api.interceptors.response.eject(interceptorId);
}
