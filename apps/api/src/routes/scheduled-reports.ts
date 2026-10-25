import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PERMISSIONS, requireAuth, requirePermission } from "../lib/auth.js";
import { notFound } from "../lib/http-error.js";

const scheduledReportSchema = z.object({
  name: z.string().min(2),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  recipients: z.array(z.string().min(3)).min(1),
  format: z.enum(["pdf", "excel", "both"]),
  channel: z.enum(["email", "whatsapp"]),
  enabled: z.boolean().default(true),
  nextRunAt: z.string().datetime().optional(),
});

function publicReport(row: {
  id: string;
  name: string;
  frequency: string;
  recipientsJson: unknown;
  format: string;
  channel: string;
  enabled: boolean;
  lastSentAt: Date | null;
  nextRunAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
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

export async function scheduledReportRoutes(app: FastifyInstance) {
  app.get(
    "/reports/scheduled",
    { preHandler: [requireAuth, requirePermission(PERMISSIONS.reportsView)] },
    async (request) => {
      const rows = await app.prisma.scheduledReport.findMany({
        where: { tenantId: request.tenantId },
        orderBy: { createdAt: "desc" },
      });

      return rows.map(publicReport);
    },
  );

  app.post(
    "/reports/scheduled",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const payload = scheduledReportSchema.parse(request.body);
      const row = await app.prisma.scheduledReport.create({
        data: {
          tenantId: request.tenantId as string,
          name: payload.name,
          frequency: payload.frequency,
          recipientsJson: payload.recipients,
          format: payload.format,
          channel: payload.channel,
          enabled: payload.enabled,
          nextRunAt: payload.nextRunAt ? new Date(payload.nextRunAt) : null,
        },
      });

      return publicReport(row);
    },
  );

  app.patch(
    "/reports/scheduled/:id",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const payload = scheduledReportSchema.partial().parse(request.body);

      const existing = await app.prisma.scheduledReport.findFirst({
        where: { id: params.id, tenantId: request.tenantId },
      });
      if (!existing) {
        throw notFound("Reporte programado no encontrado");
      }

      const row = await app.prisma.scheduledReport.update({
        where: { id: existing.id },
        data: {
          name: payload.name,
          frequency: payload.frequency,
          recipientsJson: payload.recipients,
          format: payload.format,
          channel: payload.channel,
          enabled: payload.enabled,
          nextRunAt: payload.nextRunAt
            ? new Date(payload.nextRunAt)
            : undefined,
        },
      });

      return publicReport(row);
    },
  );

  app.delete(
    "/reports/scheduled/:id",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const existing = await app.prisma.scheduledReport.findFirst({
        where: { id: params.id, tenantId: request.tenantId },
      });
      if (!existing) {
        throw notFound("Reporte programado no encontrado");
      }

      await app.prisma.scheduledReport.delete({ where: { id: existing.id } });
      return { ok: true, deletedId: existing.id };
    },
  );
}
