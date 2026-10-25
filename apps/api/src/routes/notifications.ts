import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PERMISSIONS, requireAuth, requirePermission } from "../lib/auth.js";
import { notFound } from "../lib/http-error.js";

const templateSchema = z.object({
  subject: z.string().optional(),
  body: z.string().min(3),
  variablesJson: z.any().optional(),
});

export async function notificationRoutes(app: FastifyInstance) {
  app.get(
    "/notifications/templates",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      return app.prisma.notificationTemplate.findMany({
        where: { tenantId: request.tenantId },
        orderBy: [{ channel: "asc" }, { eventType: "asc" }],
      });
    },
  );

  app.put(
    "/notifications/templates/:id",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const payload = templateSchema.parse(request.body);

      const existing = await app.prisma.notificationTemplate.findFirst({
        where: { id: params.id, tenantId: request.tenantId },
      });
      if (!existing) {
        throw notFound("Template no encontrado");
      }

      return app.prisma.notificationTemplate.update({
        where: { id: existing.id },
        data: payload,
      });
    },
  );

  app.put(
    "/notifications/templates/:id/provider",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const payload = z
        .object({
          evolution: z.object({
            name: z.string().trim().min(1),
            language: z.string().trim().min(2).default("es"),
            parameterOrder: z.array(z.string().trim().min(1)).default([]),
          }),
        })
        .parse(request.body);
      const existing = await app.prisma.notificationTemplate.findFirst({
        where: {
          id: params.id,
          tenantId: request.tenantId,
          channel: "whatsapp",
        },
      });
      if (!existing) {
        throw notFound("Plantilla WhatsApp no encontrada");
      }
      return app.prisma.notificationTemplate.update({
        where: { id: existing.id },
        data: { variablesJson: payload },
      });
    },
  );
}
