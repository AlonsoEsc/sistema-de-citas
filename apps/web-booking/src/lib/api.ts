import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const TENANT_SLUG = import.meta.env.VITE_TENANT_SLUG ?? "demo-barberia";

export const bookingApi = axios.create({
  baseURL: API_URL,
});

export const tenantSlug = TENANT_SLUG;
