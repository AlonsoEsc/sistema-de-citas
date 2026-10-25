import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@citas/db";
import { PERMISSIONS, requireAuth, requirePermission } from "../lib/auth.js";
import { badRequest, notFound } from "../lib/http-error.js";

export async function planRoutes(app: FastifyInstance) {
  app.get("/plans", { preHandler: [requireAuth] }, async () => {
    return app.prisma.plan.findMany({ orderBy: { priceCents: "asc" } });
  });

  app.get("/subscription", { preHandler: [requireAuth] }, async (request) => {
    const subscription = await app.prisma.tenantSubscription.findFirst({
      where: { tenantId: request.tenantId, status: "active" },
      include: { plan: true },
    });
    return subscription ?? null;
  });

  app.post(
    "/subscription/upgrade",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const payload = z
        .object({ planCode: z.string().min(1) })
        .parse(request.body);
      const tenantId = request.tenantId as string;

      const plan = await app.prisma.plan.findUnique({
        where: { code: payload.planCode },
      });
      if (!plan) {
        throw notFound("Plan no encontrado");
      }

      const current = await app.prisma.tenantSubscription.findFirst({
        where: { tenantId, status: "active" },
      });
      if (current && current.planId === plan.id) {
        throw badRequest("Ya estas en ese plan");
      }

      await app.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (current) {
          await tx.tenantSubscription.update({
            where: { tenantId_planId: { tenantId, planId: current.planId } },
            data: { status: "expired" },
          });
        }

        await tx.tenantSubscription.upsert({
          where: {
            tenantId_planId: {
              tenantId,
              planId: plan.id,
            },
          },
          create: {
            tenantId,
            planId: plan.id,
            status: "active",
            currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          },
          update: {
            status: "active",
            currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
            cancelAtPeriodEnd: false,
          },
        });
      });

      return { ok: true };
    },
  );
}
