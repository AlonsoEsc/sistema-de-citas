import type { PrismaClient } from "@citas/db";
import bcrypt from "bcryptjs";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../shared/errors.js";
import { verifySessionToken } from "../../shared/session.js";
import {
  PLATFORM_TOKEN_TYPE,
  type PlatformTokenPayload,
} from "../auth/tokens.js";

/** Sesiones de superadmin cortas: el panel de plataforma maneja pagos y suspensiones. */
const PLATFORM_TOKEN_TTL = "2h";
const DUMMY_HASH = bcrypt.hashSync("dummy-platform-password", 10);

export async function authenticatePlatformAdmin(
  prisma: PrismaClient,
  jwt: FastifyInstance["jwt"],
  credentials: { email: string; password: string },
) {
  const user = await prisma.user.findUnique({
    where: { email: credentials.email.trim().toLowerCase() },
  });
  const valid = await bcrypt.compare(
    credentials.password,
    user?.passwordHash ?? DUMMY_HASH,
  );
  if (!user || !valid || !user.isActive || !user.isPlatformAdmin) {
    throw unauthorized("Credenciales invalidas");
  }
  return {
    token: jwt.sign(
      {
        type: PLATFORM_TOKEN_TYPE,
        userId: user.id,
        email: user.email,
      } satisfies PlatformTokenPayload,
      { expiresIn: PLATFORM_TOKEN_TTL },
    ),
    user: { id: user.id, email: user.email, fullName: user.fullName },
  };
}

/** Exige una sesion de superadmin vigente de un usuario que sigue siendo superadmin. */
export async function requirePlatformAdmin(request: FastifyRequest) {
  const payload = await verifySessionToken<PlatformTokenPayload>(
    request,
    "platform",
  );
  if (!payload || payload.type !== PLATFORM_TOKEN_TYPE || !payload.userId) {
    throw unauthorized();
  }
  const user = await request.server.prisma.user.findUnique({
    where: { id: payload.userId },
  });
  const revoked =
    user?.passwordChangedAt &&
    (payload.iat ?? 0) * 1000 < user.passwordChangedAt.getTime() - 1000;
  if (!user || !user.isActive || !user.isPlatformAdmin || revoked) {
    throw unauthorized("La sesion ya no es valida", "SESSION_REVOKED");
  }
  request.platformAdmin = { userId: user.id, email: user.email };
}
