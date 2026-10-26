import type { FastifyRequest } from "fastify";
import {
  forbidden,
  paymentRequired,
  unauthorized,
} from "../../shared/errors.js";
import { tenantOf } from "../tenancy/tenant-context.js";
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

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Con la prueba o el pago vencidos el panel queda en solo lectura: se puede consultar y
 * exportar, pero no crear ni modificar. Una cuenta suspendida tampoco puede escribir.
 */
export async function requireWritableAccount(request: FastifyRequest) {
  if (READ_METHODS.has(request.method)) {
    return;
  }
  const tenant = await tenantOf(request);
  if (tenant.suspended) {
    throw forbidden(
      "La cuenta esta suspendida. Contacta a soporte.",
      "ACCOUNT_SUSPENDED",
    );
  }
  if (tenant.access !== "full") {
    throw paymentRequired(
      "Tu prueba o suscripcion vencio. Renueva el plan para seguir haciendo cambios.",
      "SUBSCRIPTION_INACTIVE",
    );
  }
}

/** preHandler de rutas del panel: autenticacion, permiso opcional y cuenta habilitada. */
export function adminAccess(permission?: PermissionKey) {
  return [
    requireAuth,
    ...(permission ? [requirePermission(permission)] : []),
    requireWritableAccount,
  ];
}
