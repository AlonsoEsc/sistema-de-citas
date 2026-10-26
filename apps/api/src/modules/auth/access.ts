import type { PrismaClient } from "@citas/db";
import { OWNER_ROLE, PERMISSIONS } from "./permissions.js";

export type UserAccess = {
  email: string;
  passwordChangedAt: Date | null;
  roles: string[];
  permissions: string[];
};

/**
 * Roles y permisos efectivos de un usuario dentro de un negocio. Devuelve null si el usuario
 * esta inactivo o ya no pertenece al negocio, lo que invalida tokens emitidos antes.
 */
export async function loadUserAccess(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
): Promise<UserAccess | null> {
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

  return {
    email: membership.user.email,
    passwordChangedAt: membership.user.passwordChangedAt,
    roles,
    permissions,
  };
}
