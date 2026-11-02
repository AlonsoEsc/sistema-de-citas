import type { PrismaClient, UserTokenType } from "@citas/db";
import bcrypt from "bcryptjs";
import { badRequest } from "../../shared/errors.js";
import { recordAudit } from "../audit/audit.service.js";
import { accountEmails, panelLink, queueEmail } from "./emails.js";
import { createOneTimeToken, hashOneTimeToken } from "./one-time-token.js";

const HOUR_MS = 3_600_000;
const TOKEN_TTL_MS: Record<UserTokenType, number> = {
  email_verification: 48 * HOUR_MS,
  password_reset: 1 * HOUR_MS,
};

async function issueUserToken(
  prisma: PrismaClient,
  userId: string,
  type: UserTokenType,
) {
  // Un enlace nuevo invalida los anteriores del mismo tipo.
  await prisma.userToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });
  const { token, tokenHash } = createOneTimeToken();
  await prisma.userToken.create({
    data: {
      userId,
      type,
      tokenHash,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]),
    },
  });
  return token;
}

/** Consume un token valido (no usado ni vencido) y devuelve su usuario. */
async function consumeUserToken(
  prisma: PrismaClient,
  token: string,
  type: UserTokenType,
) {
  const tokenHash = hashOneTimeToken(token);
  const claimed = await prisma.userToken.updateMany({
    where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw badRequest(
      "El enlace no es valido o ya vencio. Solicita uno nuevo.",
      "TOKEN_INVALID",
    );
  }
  const row = await prisma.userToken.findUniqueOrThrow({
    where: { tokenHash },
    include: { user: true },
  });
  return row.user;
}

/** El correo transaccional sale por el outbox de algun negocio del usuario. */
async function outboxTenantFor(prisma: PrismaClient, userId: string) {
  const membership = await prisma.tenantUser.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  return membership?.tenantId;
}

export async function sendEmailVerification(
  prisma: PrismaClient,
  user: { id: string; email: string; fullName: string | null },
) {
  const tenantId = await outboxTenantFor(prisma, user.id);
  if (!tenantId) {
    return;
  }
  const token = await issueUserToken(prisma, user.id, "email_verification");
  await queueEmail(prisma, tenantId, {
    to: user.email,
    ...accountEmails.verifyEmail(
      user.fullName ?? user.email,
      panelLink("/verificar-correo", token),
    ),
  });
}

export async function verifyEmail(prisma: PrismaClient, token: string) {
  const user = await consumeUserToken(prisma, token, "email_verification");
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
  });
  return { ok: true as const };
}

/**
 * Siempre responde igual, exista o no el correo: no revela que cuentas estan registradas.
 */
export async function requestPasswordReset(
  prisma: PrismaClient,
  email: string,
  ip?: string,
) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  const tenantId = user?.isActive
    ? await outboxTenantFor(prisma, user.id)
    : undefined;
  if (user && tenantId) {
    const token = await issueUserToken(prisma, user.id, "password_reset");
    await queueEmail(prisma, tenantId, {
      to: user.email,
      ...accountEmails.passwordReset(panelLink("/restablecer", token)),
    });
    await recordAudit(prisma, {
      tenantId,
      actorUserId: user.id,
      action: "account.password_reset_requested",
      ip,
    });
  }
  return { ok: true as const };
}

export async function resetPassword(
  prisma: PrismaClient,
  input: { token: string; password: string },
  ip?: string,
) {
  const user = await consumeUserToken(prisma, input.token, "password_reset");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(input.password, 10),
      passwordChangedAt: new Date(),
      // Recibir el enlace en su bandeja prueba que el correo es suyo.
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    },
  });
  await recordAudit(prisma, {
    tenantId: await outboxTenantFor(prisma, user.id),
    actorUserId: user.id,
    action: "account.password_reset",
    ip,
  });
  return { ok: true as const };
}

/** Cambio de contrasena con sesion iniciada: exige la contrasena actual. */
export async function changePassword(
  prisma: PrismaClient,
  input: {
    userId: string;
    tenantId: string;
    currentPassword: string;
    newPassword: string;
  },
  ip?: string,
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
  });
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw badRequest("La contrasena actual no es correcta", "WRONG_PASSWORD");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(input.newPassword, 10),
      passwordChangedAt: new Date(),
    },
  });
  await recordAudit(prisma, {
    tenantId: input.tenantId,
    actorUserId: user.id,
    action: "account.password_changed",
    ip,
  });
  return { ok: true as const };
}
