import type { ScheduledReport } from "@citas/db";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { notFoundIfMissing } from "../../shared/prisma-errors.js";
import { idParamsSchema } from "../../shared/schemas.js";
import { scopeOf } from "../../shared/tenant-scope.js";
import { adminAccess } from "../auth/guards.js";
import { PERMISSIONS } from "../auth/permissions.js";
import { loadTenantContext } from "../tenancy/tenant-context.js";
import { currentMonthRange, getOverview } from "./reports.service.js";

const tags = ["reportes"];
const security = [{ bearerAuth: [] }];
const reportNotFound = notFoundIfMissing(
  "Reporte programado no encontrado",
  "SCHEDULED_REPORT_NOT_FOUND",
);

const scheduledReportSchema = z.object({
  name: z.string().trim().min(2),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  recipients: z.array(z.string().trim().min(3)).min(1),
  format: z.enum(["pdf", "excel", "both"]),
  channel: z.enum(["email", "whatsapp"]),
  enabled: z.boolean().default(true),
  nextRunAt: z.iso.datetime({ offset: true }).optional(),
});

function publicReport(row: ScheduledReport) {
  return {
    id: row.id,
    name: row.name,
    frequency: row.frequency,
    recipients: Array.isArray(row.recipientsJson) ? row.recipientsJson : [],
    format: row.format,
    channel: row.channel,
    enabled: row.enabled,
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function reportData(input: Partial<z.infer<typeof scheduledReportSchema>>) {
  return {
    name: input.name,
    frequency: input.frequency,
    recipientsJson: input.recipients,
    format: input.format,
    channel: input.channel,
    enabled: input.enabled,
    nextRunAt: input.nextRunAt ? new Date(input.nextRunAt) : undefined,
  };
}

export async function reportRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    "/reports/overview",
    {
      preHandler: adminAccess(PERMISSIONS.reportsView),
      schema: {
        tags,
        security,
        querystring: z.object({
          from: z.iso.datetime({ offset: true }).optional(),
          to: z.iso.datetime({ offset: true }).optional(),
        }),
      },
    },
    async (request) => {
      const scope = scopeOf(request);
      const defaults = currentMonthRange(
        await loadTenantContext(scope.db, scope.tenantId),
      );
      return getOverview(scope, {
        from: request.query.from ? new Date(request.query.from) : defaults.from,
        to: request.query.to ? new Date(request.query.to) : defaults.to,
      });
    },
  );

  routes.get(
    "/reports/scheduled",
    {
      preHandler: adminAccess(PERMISSIONS.reportsView),
      schema: { tags, security },
    },
    async (request) => {
      const rows = await scopeOf(request).db.scheduledReport.findMany({
        orderBy: { createdAt: "desc" },
      });
      return rows.map(publicReport);
    },
  );

  routes.post(
    "/reports/scheduled",
    {
      preHandler: adminAccess(PERMISSIONS.settingsManage),
      schema: { tags, security, body: scheduledReportSchema },
    },
    async (request) => {
      const { db, tenantId } = scopeOf(request);
      const body = request.body;
      const row = await db.scheduledReport.create({
        data: {
          tenantId,
          name: body.name,
          frequency: body.frequency,
          recipientsJson: body.recipients,
          format: body.format,
          channel: body.channel,
          enabled: body.enabled,
          nextRunAt: body.nextRunAt ? new Date(body.nextRunAt) : null,
        },
      });
      return publicReport(row);
    },
  );

  routes.patch(
    "/reports/scheduled/:id",
    {
      preHandler: adminAccess(PERMISSIONS.settingsManage),
      schema: {
        tags,
        security,
        params: idParamsSchema,
        body: scheduledReportSchema.partial(),
      },
    },
    async (request) => {
      const row = await scopeOf(request)
        .db.scheduledReport.update({
          where: { id: request.params.id },
          data: reportData(request.body),
        })
        .catch(reportNotFound);
      return publicReport(row);
    },
  );

  routes.delete(
    "/reports/scheduled/:id",
    {
      preHandler: adminAccess(PERMISSIONS.settingsManage),
      schema: { tags, security, params: idParamsSchema },
    },
    async (request) => {
      await scopeOf(request)
        .db.scheduledReport.delete({ where: { id: request.params.id } })
        .catch(reportNotFound);
      return { ok: true as const, deletedId: request.params.id };
    },
  );
}
