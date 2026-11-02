import type { PrismaClient } from "@citas/db";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { env } from "../../config.js";
import { unauthorized } from "../../shared/errors.js";
import { loadUserAccess } from "./access.js";
import { ADMIN_TOKEN_TYPE, type AdminTokenPayload } from "./tokens.js";

// Hash valido para comparar cuando el usuario no existe: el tiempo de respuesta no revela
// si el correo esta registrado.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

type Credentials = { email: string; password: string; tenantSlug: string };

export async function authenticateAdmin(
  prisma: PrismaClient,
  credentials: Credentials,
) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: credentials.tenantSlug },
  });
  const user = tenant
    ? await prisma.user.findUnique({
        where: { email: credentials.email.trim().toLowerCase() },
      })
    : null;

  const passwordMatches = await bcrypt.compare(
    credentials.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  const access =
    tenant && user && passwordMatches
      ? await loadUserAccess(prisma, tenant.id, user.id)
      : null;

  if (!tenant || !user || !access) {
    throw unauthorized("Credenciales invalidas");
  }
  return { tenant, user, access };
}

export function issueAdminToken(
  jwt: FastifyInstance["jwt"],
  payload: Omit<AdminTokenPayload, "type">,
) {
  return jwt.sign(
    {
      type: ADMIN_TOKEN_TYPE,
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
    } satisfies AdminTokenPayload,
    { expiresIn: env.ADMIN_JWT_EXPIRES_IN },
  );
}
