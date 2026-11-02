const ADMIN_URL = (
  import.meta.env.VITE_ADMIN_URL as string | undefined
)?.replace(/\/$/, "");

/** Paginas legales publicadas en el dominio del panel; null si no esta configurado. */
export const legalLinks = ADMIN_URL
  ? { terms: `${ADMIN_URL}/terminos`, privacy: `${ADMIN_URL}/privacidad` }
  : null;
