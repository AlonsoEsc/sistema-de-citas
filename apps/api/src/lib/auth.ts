import type { PrismaClient } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "./http-error.js";

export const ADMIN_TOKEN_TYPE = "admin";

export const PERMISSIONS = {
  appointmentsManage: "appointments.manage",
  staffManage: "staff.manage",
  servicesManage: "services.manage",
  customersManage: "customers.manage",
  reportsView: "reports.view",
  settingsManage: "settings.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// El rol owner tiene todos los permisos aunque la tabla RolePermission no este sembrada.
const OWNER_ROLE = "owner";

export type AdminTokenPayload = {
  type: typeof ADMIN_TOKEN_TYPE;
  userId: string;
  tenantId: string;
  email: string;
};

export async function loadUserAccess(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
) {
  const membership = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    include: {
      user: {
        include: {
          userRoles: {
            where: { tenantId },
            include: {
              role: {
                include: { permissions: { include: { permission: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (
    !membership ||
    membership.status !== "active" ||
    !membership.user.isActive
  ) {
    return null;
  }

  const roles = membership.user.userRoles.map((item) => item.role.name);
  const permissions = roles.includes(OWNER_ROLE)
    ? Object.values(PERMISSIONS)
    : [
        ...new Set(
          membership.user.userRoles.flatMap((item) =>
            item.role.permissions.map((rp) => rp.permission.key),
          ),
        ),
      ];

  return { email: membership.user.email, roles, permissions };
}

export async function requireAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
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
  request.tenantId = payload.tenantId;
}

export function requirePermission(permission: PermissionKey) {
  return async function permissionGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ) {
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
