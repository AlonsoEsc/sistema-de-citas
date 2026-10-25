import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadEntitlements } from "../lib/entitlements.js";
import { notFound } from "../lib/http-error.js";
import { PERMISSIONS, requireAuth, requirePermission } from "../lib/auth.js";

const updateSettingsSchema = z.object({
  cancelPolicyMinutes: z.number().int().min(0).max(10080).optional(),
  bookingWindowDays: z.number().int().min(1).max(365).optional(),
  brandingJson: z.record(z.string(), z.any()).optional(),
});

export async function tenantRoutes(app: FastifyInstance) {
  app.get(
    "/tenants/me",
    { preHandler: [requireAuth, loadEntitlements] },
    async (request) => {
      const tenant = await app.prisma.tenant.findUnique({
        where: { id: request.tenantId },
        include: { settings: true },
      });

      if (!tenant) {
        throw notFound("Tenant no encontrado");
      }

      return {
        tenant,
        entitlements: request.entitlements ?? {},
      };
    },
  );

  app.patch(
    "/tenants/me/settings",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const payload = updateSettingsSchema.parse(request.body);
      const tenantId = request.tenantId as string;

      const existing = await app.prisma.tenantSetting.findUnique({
        where: { tenantId },
      });
      if (!existing) {
        return app.prisma.tenantSetting.create({
          data: { tenantId, ...payload },
        });
      }

      return app.prisma.tenantSetting.update({
        where: { tenantId },
        data: payload,
      });
    },
  );

  app.get(
    "/entitlements",
    { preHandler: [requireAuth, loadEntitlements] },
    async (request) => {
      return request.entitlements ?? {};
    },
  );
}
