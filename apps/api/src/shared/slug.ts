/** Identificadores que no puede usar un negocio porque chocan con rutas de la plataforma. */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "docs",
  "login",
  "panel",
  "platform",
  "public",
  "registro",
  "reservas",
  "signup",
  "soporte",
  "www",
]);

const MAX_SLUG_LENGTH = 40;

/** "Barbería El Güero" -> "barberia-el-guero". */
export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
