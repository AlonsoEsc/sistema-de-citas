import type { FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "../../shared/errors.js";
import { tenantScope } from "../../shared/tenant-scope.js";
import { loadUserAccess } from "./access.js";
import type { PermissionKey } from "./permissions.js";
import { ADMIN_TOKEN_TYPE, type AdminTokenPayload } from "./tokens.js";

/**
 * Exige un token de administracion vigente y una membresia activa en el negocio. Deja en la
 * peticion la identidad (`auth`) y el acceso a datos filtrado por tenant (`scope`).
 */
export async function requireAuth(request: FastifyRequest) {
  let payload: Partial<AdminTokenPayload>;
  try {
    payload = await request.jwtVerify<AdminTokenPayload>();
  } catch {
    throw unauthorized();
  }

  // Rechaza tokens de clientes del portal, state de OAuth y cualquier otro tipo.
  if (
    payload.type !== ADMIN_TOKEN_TYPE ||
    !payload.userId ||
    !payload.tenantId
  ) {
    throw unauthorized();
  }

  const access = await loadUserAccess(
    request.server.prisma,
    payload.tenantId,
    payload.userId,
  );
  if (!access) {
    throw unauthorized("La sesion ya no es valida", "SESSION_REVOKED");
  }

  request.auth = {
    userId: payload.userId,
    tenantId: payload.tenantId,
    email: access.email,
    roles: access.roles,
    permissions: access.permissions,
  };
  request.scope = tenantScope(request.server.prisma, payload.tenantId);
}

export function requirePermission(permission: PermissionKey) {
  return async function permissionGuard(request: FastifyRequest) {
    if (!request.auth) {
      throw unauthorized();
    }
    if (!request.auth.permissions.includes(permission)) {
      throw forbidden(
        "Tu rol no tiene permiso para esta accion",
        "PERMISSION_DENIED",
      );
    }
  };
}

/** preHandler de rutas de administracion: autenticacion y, opcionalmente, un permiso. */
export function adminAccess(permission?: PermissionKey) {
  return permission
    ? [requireAuth, requirePermission(permission)]
    : [requireAuth];
}
