import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { notFound } from "../../shared/errors.js";
import { toJsonValue } from "../../shared/json.js";
import { scopeOf } from "../../shared/tenant-scope.js";
import { adminAccess } from "../auth/guards.js";
import { PERMISSIONS } from "../auth/permissions.js";
import { loadEntitlements } from "./entitlements.js";

const tags = ["negocio"];
const security = [{ bearerAuth: [] }];

const settingsSchema = z.object({
  cancelPolicyMinutes: z.number().int().min(0).max(10080).optional(),
  bookingWindowDays: z.number().int().min(1).max(365).optional(),
  brandingJson: z.record(z.string(), z.unknown()).optional(),
});

export async function tenancyRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    "/tenants/me",
    { preHandler: adminAccess(), schema: { tags, security } },
    async (request) => {
      const { tenantId, db } = scopeOf(request);
      const [tenant, entitlements] = await Promise.all([
        db.tenant.findUnique({
          where: { id: tenantId },
          include: { settings: true },
        }),
        loadEntitlements(db),
      ]);
      if (!tenant) {
        throw notFound("Negocio no encontrado", "TENANT_NOT_FOUND");
      }
      return { tenant, entitlements };
    },
  );

  routes.patch(
    "/tenants/me/settings",
    {
      preHandler: adminAccess(PERMISSIONS.settingsManage),
      schema: { tags, security, body: settingsSchema },
    },
    async (request) => {
      const { db, tenantId } = scopeOf(request);
      const { brandingJson, ...settings } = request.body;
      const data = {
        ...settings,
        ...(brandingJson ? { brandingJson: toJsonValue(brandingJson) } : {}),
      };
      return db.tenantSetting.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      });
    },
  );

  routes.get(
    "/entitlements",
    { preHandler: adminAccess(), schema: { tags, security } },
    async (request) => loadEntitlements(scopeOf(request).db),
  );
}
