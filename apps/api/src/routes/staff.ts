import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PERMISSIONS, requireAuth, requirePermission } from "../lib/auth.js";
import { notFound } from "../lib/http-error.js";

const staffSchema = z.object({
  displayName: z.string().min(2),
  phone: z.string().optional(),
  commissionType: z.enum(["fixed", "percent"]).optional(),
  commissionValue: z.number().min(0).optional(),
  active: z.boolean().optional(),
});

const scheduleItem = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  breakJson: z
    .array(z.object({ start: z.string(), end: z.string() }))
    .optional(),
});

export async function staffRoutes(app: FastifyInstance) {
  app.get("/staff", { preHandler: [requireAuth] }, async (request) => {
    return app.prisma.staff.findMany({
      where: { tenantId: request.tenantId },
      orderBy: { displayName: "asc" },
    });
  });

  app.post(
    "/staff",
    { preHandler: [requireAuth, requirePermission(PERMISSIONS.staffManage)] },
    async (request) => {
      const payload = staffSchema.parse(request.body);

      return app.prisma.staff.create({
        data: {
          tenantId: request.tenantId as string,
          displayName: payload.displayName,
          phone: payload.phone,
          commissionType: payload.commissionType,
          commissionValue: payload.commissionValue,
          active: payload.active ?? true,
        },
      });
    },
  );

  app.patch(
    "/staff/:id",
    { preHandler: [requireAuth, requirePermission(PERMISSIONS.staffManage)] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const payload = staffSchema.partial().parse(request.body);

      const existing = await app.prisma.staff.findFirst({
        where: { id: params.id, tenantId: request.tenantId },
      });
      if (!existing) {
        throw notFound("Profesional no encontrado");
      }

      return app.prisma.staff.update({
        where: { id: existing.id },
        data: payload,
      });
    },
  );

  app.get(
    "/staff/:id/schedule",
    { preHandler: [requireAuth] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      return app.prisma.staffSchedule.findMany({
        where: { tenantId: request.tenantId, staffId: params.id },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      });
    },
  );

  app.put(
    "/staff/:id/schedule",
    { preHandler: [requireAuth, requirePermission(PERMISSIONS.staffManage)] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const payload = z.array(scheduleItem).min(1).parse(request.body);

      const existing = await app.prisma.staff.findFirst({
        where: { id: params.id, tenantId: request.tenantId },
      });
      if (!existing) {
        throw notFound("Profesional no encontrado");
      }

      await app.prisma.$transaction([
        app.prisma.staffSchedule.deleteMany({
          where: { tenantId: request.tenantId, staffId: existing.id },
        }),
        app.prisma.staffSchedule.createMany({
          data: payload.map((row) => ({
            tenantId: request.tenantId as string,
            staffId: existing.id,
            dayOfWeek: row.dayOfWeek,
            startTime: row.startTime,
            endTime: row.endTime,
            breakJson: row.breakJson,
          })),
        }),
      ]);

      return app.prisma.staffSchedule.findMany({
        where: { tenantId: request.tenantId, staffId: existing.id },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      });
    },
  );
}
