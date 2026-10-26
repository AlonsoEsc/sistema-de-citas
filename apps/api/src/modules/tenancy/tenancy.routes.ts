import { INDUSTRY_CODES, industryProfile } from "@citas/shared/industries";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { toJsonValue } from "../../shared/json.js";
import { currencySchema, timeZoneSchema } from "../../shared/schemas.js";
import { scopeOf } from "../../shared/tenant-scope.js";
import { recordAudit } from "../audit/audit.service.js";
import { adminAccess } from "../auth/guards.js";
import { PERMISSIONS } from "../auth/permissions.js";
import { bookingUrlFor } from "../onboarding/onboarding.service.js";
import { tenantOf } from "./tenant-context.js";

const tags = ["negocio"];
const security = [{ bearerAuth: [] }];

const settingsSchema = z.object({
  cancelPolicyMinutes: z.number().int().min(0).max(10080).optional(),
  bookingWindowDays: z.number().int().min(1).max(365).optional(),
  brandingJson: z.record(z.string(), z.unknown()).optional(),
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  industry: z.enum(INDUSTRY_CODES).optional(),
  timezone: timeZoneSchema.optional(),
  currency: currencySchema.optional(),
  locale: z
    .string()
    .regex(/^[a-z]{2}-[A-Z]{2}$/)
    .optional(),
});

export async function tenancyRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    "/tenants/me",
    {
      preHandler: adminAccess(),
      schema: {
        tags,
        security,
        summary:
          "Perfil del negocio, vocabulario de su rubro y estado de la cuenta",
      },
    },
    async (request) => {
      const tenant = await tenantOf(request);
      const settings = await scopeOf(request).db.tenantSetting.findUnique({
        where: { tenantId: tenant.id },
      });
      const industry = industryProfile(tenant.industry);
      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          industry: tenant.industry,
          timezone: tenant.timezone,
          currency: tenant.currency,
          locale: tenant.locale,
          settings,
        },
        industry: {
          label: industry.label,
          vocabulary: industry.vocabulary,
          handlesHealthData: industry.handlesHealthData,
        },
        bookingUrl: bookingUrlFor(tenant.slug),
        subscription: {
          ...tenant.subscription,
          accessUntil: tenant.subscription.accessUntil?.toISOString() ?? null,
        },
        access: tenant.access,
        entitlements: tenant.entitlements,
        limits: tenant.limits,
      };
    },
  );

  routes.patch(
    "/tenants/me",
    {
      preHandler: adminAccess(PERMISSIONS.settingsManage),
      schema: { tags, security, body: profileSchema },
    },
    async (request) => {
      const { db, tenantId } = scopeOf(request);
      const updated = await db.tenant.update({
        where: { id: tenantId },
        data: request.body,
        select: {
          id: true,
          name: true,
          slug: true,
          industry: true,
          timezone: true,
          currency: true,
          locale: true,
        },
      });
      await recordAudit(db, {
        tenantId,
        actorUserId: request.auth!.userId,
        action: "tenant.profile_updated",
        entityType: "Tenant",
        entityId: tenantId,
        metadata: { fields: Object.keys(request.body) },
        ip: request.ip,
      });
      return updated;
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
    async (request) => (await tenantOf(request)).entitlements,
  );
}
