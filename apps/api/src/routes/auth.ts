import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../config.js";
import {
  ADMIN_TOKEN_TYPE,
  loadUserAccess,
  requireAuth,
  type AdminTokenPayload,
} from "../lib/auth.js";
import { unauthorized } from "../lib/http-error.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  tenantSlug: z.string().min(2),
});

// Hash valido para comparar cuando el usuario no existe y no revelar por tiempo de respuesta
// que el correo no esta registrado.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

function signAdminToken(
  app: FastifyInstance,
  payload: Omit<AdminTokenPayload, "type">,
) {
  return app.jwt.sign(
    {
      type: ADMIN_TOKEN_TYPE,
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
    },
    { expiresIn: env.ADMIN_JWT_EXPIRES_IN },
  );
}

export async function authRoutes(app: FastifyInstance) {
  app.register(async (authApp) => {
    await authApp.register(import("@fastify/rate-limit"), {
      max: 10,
      timeWindow: "1 minute",
    });

    authApp.post("/auth/login", async (request) => {
      const { email, password, tenantSlug } = loginSchema.parse(request.body);

      const tenant = await app.prisma.tenant.findUnique({
        where: { slug: tenantSlug },
      });
      const user = tenant
        ? await app.prisma.user.findUnique({ where: { email } })
        : null;

      const isValid = await bcrypt.compare(
        password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );
      const access =
        tenant && user && isValid
          ? await loadUserAccess(app.prisma, tenant.id, user.id)
          : null;

      if (!tenant || !user || !isValid || !access) {
        throw unauthorized("Credenciales invalidas");
      }

      const token = signAdminToken(app, {
        userId: user.id,
        tenantId: tenant.id,
        email: user.email,
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          roles: access.roles,
          permissions: access.permissions,
        },
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
        },
      };
    });

    // Solo renueva tokens vigentes y vuelve a validar que el usuario siga activo en el tenant.
    authApp.post(
      "/auth/refresh",
      { preHandler: [requireAuth] },
      async (request) => {
        const auth = request.auth!;
        const token = signAdminToken(app, {
          userId: auth.userId,
          tenantId: auth.tenantId,
          email: auth.email,
        });
        return { token };
      },
    );
  });

  app.get("/auth/me", { preHandler: [requireAuth] }, async (request) => {
    const auth = request.auth!;
    return {
      user: {
        id: auth.userId,
        email: auth.email,
        roles: auth.roles,
        permissions: auth.permissions,
      },
      tenantId: auth.tenantId,
    };
  });

  app.post("/auth/logout", async () => ({ ok: true }));
}
