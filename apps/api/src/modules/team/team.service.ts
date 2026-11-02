import type { PrismaClient } from "@citas/db";
import { OWNER_ROLE, ROLE_LABELS } from "@citas/shared/access";
import bcrypt from "bcryptjs";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from "../../shared/errors.js";
import { notFoundIfMissing } from "../../shared/prisma-errors.js";
import { passwordSchema } from "../../shared/schemas.js";
import type { TenantScope } from "../../shared/tenant-scope.js";
import { accountEmails, panelLink, queueEmail } from "../account/emails.js";
import {
  createOneTimeToken,
  hashOneTimeToken,
} from "../account/one-time-token.js";
import { recordAudit } from "../audit/audit.service.js";
import type { TenantContext } from "../tenancy/tenant-context.js";

const INVITATION_TTL_MS = 7 * 86_400_000;

type Actor = { userId: string; ip?: string };

function roleLabel(name: string) {
  return ROLE_LABELS[name] ?? name;
}

export async function listTeam({ db, tenantId }: TenantScope) {
  const [memberships, invitations, roles] = await Promise.all([
    db.tenantUser.findMany({
      include: {
        user: {
          include: {
            userRoles: { where: { tenantId }, include: { role: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.invitation.findMany({
      where: {
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { role: true },
      orderBy: { createdAt: "desc" },
    }),
    db.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  return {
    members: memberships.map(({ user, status }) => ({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      active: status === "active" && user.isActive,
      emailVerified: Boolean(user.emailVerifiedAt),
      roles: user.userRoles.map((item) => item.role.name),
    })),
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role.name,
      expiresAt: invitation.expiresAt.toISOString(),
    })),
    roles: roles.map((role) => ({
      name: role.name,
      label: roleLabel(role.name),
    })),
  };
}

export async function inviteMember(
  scope: TenantScope,
  tenant: Pick<TenantContext, "name">,
  input: { email: string; role: string },
  actor: Actor,
) {
  const { db, tenantId } = scope;
  const email = input.email.trim().toLowerCase();
  const role = await db.role.findFirst({ where: { name: input.role } });
  if (!role) {
    throw badRequest("Rol no valido", "INVALID_ROLE");
  }
  const existingMember = await db.tenantUser.findFirst({
    where: { user: { email } },
  });
  if (existingMember) {
    throw conflict("Esa persona ya es parte del equipo", "ALREADY_MEMBER");
  }

  const { token, tokenHash } = createOneTimeToken();
  const invitation = await db.$transaction(async (tx) => {
    // Una invitacion nueva al mismo correo reemplaza a la anterior.
    await tx.invitation.updateMany({
      where: { email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const created = await tx.invitation.create({
      data: {
        tenantId,
        email,
        roleId: role.id,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        invitedById: actor.userId,
      },
    });
    await queueEmail(tx, tenantId, {
      to: email,
      ...accountEmails.invitation(
        tenant.name,
        roleLabel(role.name),
        panelLink("/invitacion", token),
      ),
    });
    await recordAudit(tx, {
      tenantId,
      actorUserId: actor.userId,
      action: "team.member_invited",
      entityType: "Invitation",
      entityId: created.id,
      metadata: { email, role: role.name },
      ip: actor.ip,
    });
    return created;
  });

  return {
    id: invitation.id,
    email,
    role: role.name,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export async function revokeInvitation(
  { db, tenantId }: TenantScope,
  invitationId: string,
  actor: Actor,
) {
  const revoked = await db.invitation.updateMany({
    where: { id: invitationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count === 0) {
    throw notFound("Invitacion no encontrada", "INVITATION_NOT_FOUND");
  }
  await recordAudit(db, {
    tenantId,
    actorUserId: actor.userId,
    action: "team.invitation_revoked",
    entityType: "Invitation",
    entityId: invitationId,
    ip: actor.ip,
  });
  return { ok: true as const };
}

async function activeOwnerCount({ db, tenantId }: TenantScope) {
  return db.userRole.count({
    where: {
      role: { name: OWNER_ROLE },
      user: {
        isActive: true,
        tenantUsers: { some: { tenantId, status: "active" } },
      },
    },
  });
}

/** Cambia el rol o desactiva a un miembro; el negocio nunca se queda sin un dueno activo. */
export async function updateMember(
  scope: TenantScope,
  userId: string,
  input: { role?: string; active?: boolean },
  actor: Actor,
) {
  const { db, tenantId } = scope;
  if (userId === actor.userId) {
    throw forbidden(
      "No puedes cambiar tu propio rol ni desactivarte",
      "CANNOT_EDIT_SELF",
    );
  }
  const membership = await db.tenantUser
    .findUniqueOrThrow({
      where: { tenantId_userId: { tenantId, userId } },
      include: {
        user: { include: { userRoles: { include: { role: true } } } },
      },
    })
    .catch(notFoundIfMissing("Miembro no encontrado", "MEMBER_NOT_FOUND"));
  const isOwner = membership.user.userRoles.some(
    (item) => item.tenantId === tenantId && item.role.name === OWNER_ROLE,
  );
  const losesOwner =
    isOwner &&
    ((input.role !== undefined && input.role !== OWNER_ROLE) ||
      input.active === false);
  if (losesOwner && (await activeOwnerCount(scope)) <= 1) {
    throw forbidden(
      "El negocio debe tener al menos un dueno activo",
      "LAST_OWNER",
    );
  }

  const role = input.role
    ? await db.role.findFirst({ where: { name: input.role } })
    : undefined;
  if (input.role && !role) {
    throw badRequest("Rol no valido", "INVALID_ROLE");
  }

  await db.$transaction(async (tx) => {
    if (role) {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.create({ data: { tenantId, userId, roleId: role.id } });
    }
    if (input.active !== undefined) {
      await tx.tenantUser.update({
        where: { tenantId_userId: { tenantId, userId } },
        data: { status: input.active ? "active" : "inactive" },
      });
    }
    await recordAudit(tx, {
      tenantId,
      actorUserId: actor.userId,
      action: "team.member_updated",
      entityType: "User",
      entityId: userId,
      metadata: input,
      ip: actor.ip,
    });
  });
  return { ok: true as const };
}

async function pendingInvitation(prisma: PrismaClient, token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashOneTimeToken(token) },
    include: { tenant: true, role: true },
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt.getTime() < Date.now()
  ) {
    throw badRequest(
      "La invitacion no es valida o ya vencio. Pide una nueva.",
      "INVITATION_INVALID",
    );
  }
  return invitation;
}

/** Datos para mostrar la pagina de aceptar invitacion. */
export async function describeInvitation(prisma: PrismaClient, token: string) {
  const invitation = await pendingInvitation(prisma, token);
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true },
  });
  return {
    businessName: invitation.tenant.name,
    tenantSlug: invitation.tenant.slug,
    email: invitation.email,
    role: invitation.role.name,
    roleLabel: roleLabel(invitation.role.name),
    hasAccount: Boolean(existingUser),
  };
}

/**
 * Acepta una invitacion. Con cuenta existente exige su contrasena; si no, crea la cuenta
 * (el enlace recibido por correo prueba que el correo es suyo).
 */
export async function acceptInvitation(
  prisma: PrismaClient,
  input: { token: string; password: string; fullName?: string },
  ip?: string,
) {
  const invitation = await pendingInvitation(prisma, input.token);
  const existing = await prisma.user.findUnique({
    where: { email: invitation.email },
  });
  if (
    existing &&
    !(await bcrypt.compare(input.password, existing.passwordHash))
  ) {
    throw unauthorized("La contrasena no es correcta", "WRONG_PASSWORD");
  }
  if (!existing) {
    if (!input.fullName) {
      throw badRequest("Escribe tu nombre", "NAME_REQUIRED");
    }
    // Una cuenta nueva debe cumplir la politica de contrasenas.
    passwordSchema.parse(input.password);
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw badRequest("La invitacion ya fue usada", "INVITATION_INVALID");
    }
    const user =
      existing ??
      (await tx.user.create({
        data: {
          email: invitation.email,
          fullName: input.fullName,
          passwordHash: await bcrypt.hash(input.password, 10),
          emailVerifiedAt: new Date(),
        },
      }));
    await tx.tenantUser.upsert({
      where: {
        tenantId_userId: { tenantId: invitation.tenantId, userId: user.id },
      },
      create: { tenantId: invitation.tenantId, userId: user.id },
      update: { status: "active" },
    });
    await tx.userRole.create({
      data: {
        tenantId: invitation.tenantId,
        userId: user.id,
        roleId: invitation.roleId,
      },
    });
    await recordAudit(tx, {
      tenantId: invitation.tenantId,
      actorUserId: user.id,
      action: "team.invitation_accepted",
      entityType: "Invitation",
      entityId: invitation.id,
      ip,
    });
    return { user, tenant: invitation.tenant };
  });
}
