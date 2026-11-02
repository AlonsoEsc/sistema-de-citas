import { INDUSTRIES, INDUSTRY_CODES } from "@citas/shared/industries";
import { registerRateLimit } from "../../shared/rate-limit.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  currencySchema,
  passwordSchema,
  timeZoneSchema,
} from "../../shared/schemas.js";
import { setSessionCookie } from "../../shared/session.js";
import { SLUG_PATTERN } from "../../shared/slug.js";
import { scopeOf } from "../../shared/tenant-scope.js";
import { sendEmailVerification } from "../account/account.service.js";
import { issueAdminToken } from "../auth/auth.service.js";
import { loadUserAccess } from "../auth/access.js";
import { adminAccess } from "../auth/guards.js";
import { provisionTenant } from "../tenancy/provisioning.service.js";
import { tenantOf } from "../tenancy/tenant-context.js";
import { bookingUrlFor, getOnboardingChecklist } from "./onboarding.service.js";

const tags = ["registro"];

export async function onboardingRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    "/industries",
    { schema: { tags, summary: "Rubros disponibles al crear un negocio" } },
    async () => INDUSTRIES,
  );

  // Registro publico: limite estricto por IP contra creacion masiva de cuentas.
  await routes.register(async (signup) => {
    await registerRateLimit(signup, "signup", { max: 5, timeWindow: "1 hour" });
    signup.withTypeProvider<ZodTypeProvider>().post(
      "/signup",
      {
        schema: {
          tags,
          summary: "Crea un negocio con prueba gratuita y su usuario dueno",
          body: z.object({
            businessName: z.string().trim().min(2).max(80),
            industry: z.enum(INDUSTRY_CODES),
            slug: z
              .string()
              .regex(SLUG_PATTERN, "Solo minusculas, numeros y guiones")
              .optional(),
            timezone: timeZoneSchema.default("America/El_Salvador"),
            currency: currencySchema.default("USD"),
            ownerName: z.string().trim().min(2).max(80),
            email: z.email(),
            password: passwordSchema,
            acceptTerms: z.literal(true, {
              error: "Debes aceptar los terminos y la politica de privacidad",
            }),
          }),
        },
      },
      async (request, reply) => {
        const body = request.body;
        const { tenant, user } = await provisionTenant(app.prisma, {
          businessName: body.businessName,
          slug: body.slug,
          industry: body.industry,
          timezone: body.timezone,
          currency: body.currency,
          owner: {
            fullName: body.ownerName,
            email: body.email,
            password: body.password,
          },
          ip: request.ip,
        });
        await sendEmailVerification(app.prisma, user);
        const access = await loadUserAccess(app.prisma, tenant.id, user.id);
        const token = issueAdminToken(app.jwt, {
          userId: user.id,
          tenantId: tenant.id,
          email: user.email,
        });
        setSessionCookie(request, reply, "admin", token);

        return reply.status(201).send({
          token,
          user: {
            id: user.id,
            email: user.email,
            roles: access?.roles ?? [],
            permissions: access?.permissions ?? [],
          },
          tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
          bookingUrl: bookingUrlFor(tenant.slug),
        });
      },
    );
  });

  routes.get(
    "/onboarding",
    {
      preHandler: adminAccess(),
      schema: {
        tags,
        security: [{ bearerAuth: [] }],
        summary: "Pasos pendientes para empezar a recibir reservas",
      },
    },
    async (request) => {
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: request.auth!.userId },
        select: { emailVerifiedAt: true },
      });
      return getOnboardingChecklist(scopeOf(request), await tenantOf(request), {
        emailVerified: Boolean(user.emailVerifiedAt),
      });
    },
  );
}
