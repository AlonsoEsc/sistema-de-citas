import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticateAdmin, issueAdminToken } from "./auth.service.js";
import { requireAuth } from "./guards.js";

const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});

const tags = ["auth"];

export async function authRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // Login y refresh comparten un limite estricto por IP contra fuerza bruta.
  await routes.register(async (limited) => {
    await limited.register(rateLimit, { max: 10, timeWindow: "1 minute" });
    const scoped = limited.withTypeProvider<ZodTypeProvider>();

    scoped.post(
      "/auth/login",
      {
        schema: {
          tags,
          summary: "Inicia sesion en el panel de un negocio",
          body: z.object({
            email: z.email(),
            password: z.string().min(6),
            tenantSlug: z.string().min(2),
          }),
          response: {
            200: z.object({
              token: z.string(),
              user: sessionUserSchema,
              tenant: z.object({
                id: z.string(),
                slug: z.string(),
                name: z.string(),
              }),
            }),
          },
        },
      },
      async (request) => {
        const { tenant, user, access } = await authenticateAdmin(
          app.prisma,
          request.body,
        );
        return {
          token: issueAdminToken(app.jwt, {
            userId: user.id,
            tenantId: tenant.id,
            email: user.email,
          }),
          user: {
            id: user.id,
            email: user.email,
            roles: access.roles,
            permissions: access.permissions,
          },
          tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
        };
      },
    );

    // Renueva solo tokens vigentes; requireAuth ya revalido que el usuario siga activo.
    scoped.post(
      "/auth/refresh",
      {
        preHandler: [requireAuth],
        schema: {
          tags,
          security: [{ bearerAuth: [] }],
          response: { 200: z.object({ token: z.string() }) },
        },
      },
      async (request) => {
        const auth = request.auth!;
        return {
          token: issueAdminToken(app.jwt, {
            userId: auth.userId,
            tenantId: auth.tenantId,
            email: auth.email,
          }),
        };
      },
    );
  });

  routes.get(
    "/auth/me",
    {
      preHandler: [requireAuth],
      schema: {
        tags,
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({ user: sessionUserSchema, tenantId: z.string() }),
        },
      },
    },
    async (request) => {
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
    },
  );

  routes.post(
    "/auth/logout",
    { schema: { tags, response: { 200: z.object({ ok: z.literal(true) }) } } },
    async () => ({ ok: true as const }),
  );
}
