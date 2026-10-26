import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const bookingApi = axios.create({
  baseURL: API_URL,
});

/**
 * Negocio del portal: primer segmento de la URL (reservas.dominio.com/barberia-x).
 * Null si la direccion no trae un identificador valido.
 */
function slugFromLocation() {
  const [first] = window.location.pathname.split("/").filter(Boolean);
  const slug = first ? decodeURIComponent(first).toLowerCase() : "";
  return SLUG_PATTERN.test(slug) ? slug : null;
}

export const tenantSlug = slugFromLocation();
