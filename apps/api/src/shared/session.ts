import type { FastifyReply, FastifyRequest } from "fastify";
import { isProduction } from "../config.js";
import { forbidden } from "./errors.js";

/**
 * Sesiones del navegador en cookies httpOnly: el JavaScript de la pagina no puede leer el
 * token, asi que una falla de XSS no permite robar la sesion. Clientes que no son
 * navegador pueden seguir enviando `Authorization: Bearer`.
 *
 * Proteccion CSRF: las cookies son SameSite=Lax y, ademas, toda escritura autenticada por
 * cookie exige el encabezado CSRF_HEADER. Un sitio ajeno no puede enviarlo porque CORS
 * solo admite los origenes del panel y del portal.
 */
export type SessionKind = "admin" | "platform" | "booking";

export const CSRF_HEADER = "x-requested-with";

const COOKIE_NAMES: Record<SessionKind, string> = {
  admin: "citas_admin",
  platform: "citas_platform",
  booking: "citas_booking",
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** La cookie del portal solo viaja a las rutas de ese negocio. */
function cookiePath(kind: SessionKind, tenantSlug?: string) {
  if (kind === "booking") {
    return `/public/${tenantSlug}`;
  }
  return kind === "platform" ? "/platform" : "/";
}

function cookieOptions(kind: SessionKind, tenantSlug?: string) {
  return {
    path: cookiePath(kind, tenantSlug),
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
  };
}

/** Guarda el token en su cookie; vence junto con el token. */
export function setSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  kind: SessionKind,
  token: string,
  tenantSlug?: string,
) {
  const payload = request.server.jwt.decode<{ exp?: number }>(token);
  const maxAge = payload?.exp
    ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
    : undefined;
  reply.setCookie(COOKIE_NAMES[kind], token, {
    ...cookieOptions(kind, tenantSlug),
    maxAge,
  });
}

export function clearSessionCookie(
  reply: FastifyReply,
  kind: SessionKind,
  tenantSlug?: string,
) {
  reply.clearCookie(COOKIE_NAMES[kind], cookieOptions(kind, tenantSlug));
}

/**
 * Verifica el token de la peticion: primero `Authorization: Bearer`, si no, la cookie. Con
 * cookie, las escrituras deben traer el encabezado anti-CSRF. Devuelve null si no hay
 * token o no es valido (la firma o la vigencia fallan).
 */
export async function verifySessionToken<T extends object>(
  request: FastifyRequest,
  kind: SessionKind,
): Promise<(Partial<T> & { iat?: number }) | null> {
  const header = request.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const cookie = request.cookies[COOKIE_NAMES[kind]];
  const token = bearer ?? cookie;
  if (!token) {
    return null;
  }
  if (
    !bearer &&
    !SAFE_METHODS.has(request.method) &&
    !request.headers[CSRF_HEADER]
  ) {
    throw forbidden(
      "Falta el encabezado de seguridad de la peticion",
      "CSRF_HEADER_MISSING",
    );
  }
  try {
    return request.server.jwt.verify<Partial<T> & { iat?: number }>(token);
  } catch {
    return null;
  }
}
