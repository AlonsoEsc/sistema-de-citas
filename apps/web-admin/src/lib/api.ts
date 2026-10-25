import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const api = axios.create({
  baseURL: API_URL,
});

export function setAuthToken(token?: string) {
  if (!token) {
    delete api.defaults.headers.common.Authorization;
    return;
  }
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

// Cierra la sesion cuando la API responde 401 (token vencido, revocado o de otro tipo).
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
