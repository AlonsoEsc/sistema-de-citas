import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PERMISSIONS, requireAuth, requirePermission } from "../lib/auth.js";
import { notFound } from "../lib/http-error.js";

const serviceSchema = z.object({
  name: z.string().min(2),
  durationMinutes: z.number().int().min(5).max(480),
  priceCents: z.number().int().min(0),
  active: z.boolean().optional(),
});

export async function serviceRoutes(app: FastifyInstance) {
  app.get("/services", { preHandler: [requireAuth] }, async (request) => {
    return app.prisma.service.findMany({
      where: { tenantId: request.tenantId },
      orderBy: { name: "asc" },
    });
  });

  app.post(
    "/services",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.servicesManage)],
    },
    async (request) => {
      const payload = serviceSchema.parse(request.body);

      return app.prisma.service.create({
        data: {
          tenantId: request.tenantId as string,
          name: payload.name,
          durationMinutes: payload.durationMinutes,
          priceCents: payload.priceCents,
          active: payload.active ?? true,
        },
      });
    },
  );

  app.patch(
    "/services/:id",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.servicesManage)],
    },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const payload = serviceSchema.partial().parse(request.body);

      const existing = await app.prisma.service.findFirst({
        where: { id: params.id, tenantId: request.tenantId },
      });
      if (!existing) {
        throw notFound("Servicio no encontrado");
      }

      return app.prisma.service.update({
        where: { id: existing.id },
        data: payload,
      });
    },
  );
}
