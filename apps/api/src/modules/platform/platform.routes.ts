import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { currencySchema } from "../../shared/schemas.js";
import {
  authenticatePlatformAdmin,
  requirePlatformAdmin,
} from "./platform-auth.js";
import * as platform from "./platform.service.js";

const tags = ["plataforma"];
const security = [{ bearerAuth: [] }];
const tenantParams = z.object({ id: z.guid() });

function actorOf(request: FastifyRequest) {
  return { userId: request.platformAdmin!.userId, ip: request.ip };
}

/** Panel de la plataforma (superadmin): negocios, pagos, planes y suspensiones. */
export async function platformRoutes(app: FastifyInstance) {
  await app.register(async (login) => {
    await login.register(rateLimit, { max: 5, timeWindow: "1 minute" });
    login.withTypeProvider<ZodTypeProvider>().post(
      "/platform/auth/login",
      {
        schema: {
          tags,
          body: z.object({ email: z.email(), password: z.string().min(1) }),
        },
      },
      async (request) =>
        authenticatePlatformAdmin(app.prisma, app.jwt, request.body),
    );
  });

  await app.register(async (admin) => {
    admin.addHook("preHandler", requirePlatformAdmin);
    const routes = admin.withTypeProvider<ZodTypeProvider>();

    routes.get(
      "/platform/tenants",
      {
        schema: {
          tags,
          security,
          querystring: z.object({
            search: z.string().trim().min(1).optional(),
            page: z.coerce.number().int().min(1).default(1),
          }),
        },
      },
      async (request) => platform.listTenants(app.prisma, request.query),
    );

    routes.get(
      "/platform/tenants/:id",
      { schema: { tags, security, params: tenantParams } },
      async (request) =>
        platform.getTenantDetail(app.prisma, request.params.id),
    );

    routes.post(
      "/platform/tenants/:id/payments",
      {
        schema: {
          tags,
          security,
          summary: "Registra un pago y extiende la suscripcion",
          params: tenantParams,
          body: z.object({
            amountCents: z.number().int().positive(),
            currency: currencySchema.optional(),
            method: z.enum(["transfer", "cash", "card", "other"]),
            reference: z.string().trim().max(120).optional(),
            notes: z.string().trim().max(500).optional(),
            months: z.number().int().min(1).max(12).default(1),
            paidAt: z.iso.datetime({ offset: true }).optional(),
          }),
        },
      },
      async (request, reply) => {
        const { paidAt, ...body } = request.body;
        const payment = await platform.recordPayment(
          app.prisma,
          request.params.id,
          { ...body, paidAt: paidAt ? new Date(paidAt) : undefined },
          actorOf(request),
        );
        return reply.status(201).send(payment);
      },
    );

    routes.patch(
      "/platform/tenants/:id/subscription",
      {
        schema: {
          tags,
          security,
          params: tenantParams,
          body: z
            .object({
              planCode: z.string().min(2).optional(),
              trialEndsAt: z.iso.datetime({ offset: true }).optional(),
              cancel: z.literal(true).optional(),
            })
            .refine(
              (body) => Object.keys(body).length > 0,
              "Indica al menos un cambio",
            ),
        },
      },
      async (request) =>
        platform.updateSubscription(
          app.prisma,
          request.params.id,
          {
            ...request.body,
            trialEndsAt: request.body.trialEndsAt
              ? new Date(request.body.trialEndsAt)
              : undefined,
          },
          actorOf(request),
        ),
    );

    routes.post(
      "/platform/tenants/:id/status",
      {
        schema: {
          tags,
          security,
          summary: "Suspende o reactiva un negocio",
          params: tenantParams,
          body: z.object({
            suspended: z.boolean(),
            reason: z.string().trim().max(300).optional(),
          }),
        },
      },
      async (request) =>
        platform.setTenantStatus(
          app.prisma,
          request.params.id,
          request.body,
          actorOf(request),
        ),
    );

    routes.get("/platform/plans", { schema: { tags, security } }, async () =>
      platform.listPlans(app.prisma),
    );

    routes.patch(
      "/platform/plans/:code",
      {
        schema: {
          tags,
          security,
          params: z.object({ code: z.string().min(2) }),
          body: z.object({
            name: z.string().trim().min(2).optional(),
            priceCents: z.number().int().min(0).optional(),
            maxStaff: z.number().int().min(1).optional(),
            whatsappMessagesPerMonth: z.number().int().min(0).optional(),
            features: z
              .record(z.string(), z.object({ enabled: z.boolean() }))
              .optional(),
            active: z.boolean().optional(),
          }),
        },
      },
      async (request) =>
        platform.updatePlan(
          app.prisma,
          request.params.code,
          request.body,
          actorOf(request),
        ),
    );
  });
}
