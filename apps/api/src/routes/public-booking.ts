import type { FastifyInstance } from "fastify";
import dayjs from "dayjs";
import { z } from "zod";
import {
  cancelAppointmentByCustomer,
  createAppointment,
} from "../services/appointment-service.js";
import { buildAvailabilityForStaff } from "../services/availability.js";
import { badRequest, notFound } from "../lib/http-error.js";
import { requireBookingCustomerAuth } from "../lib/customer-auth.js";

const bookSchema = z.object({
  staffId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).min(1),
  startAt: z.string().datetime(),
});

const cancelSchema = z.object({
  appointmentId: z.string().uuid(),
});

function dateBounds(date: string) {
  const start = dayjs(`${date}T00:00:00`);
  if (!start.isValid()) {
    throw badRequest("Fecha invalida");
  }
  return {
    start: start.toDate(),
    end: start.add(1, "day").toDate(),
  };
}

export async function publicBookingRoutes(app: FastifyInstance) {
  app.register(async (publicApp) => {
    await publicApp.register(import("@fastify/rate-limit"), {
      max: 100,
      timeWindow: "1 minute",
    });

    publicApp.get("/public/:tenantSlug/services", async (request) => {
      const params = z.object({ tenantSlug: z.string() }).parse(request.params);
      const tenant = await app.prisma.tenant.findUnique({
        where: { slug: params.tenantSlug },
      });
      if (!tenant) {
        throw notFound("Tenant no encontrado");
      }

      return app.prisma.service.findMany({
        where: { tenantId: tenant.id, active: true },
        orderBy: { name: "asc" },
      });
    });

    publicApp.get("/public/:tenantSlug/staff", async (request) => {
      const params = z.object({ tenantSlug: z.string() }).parse(request.params);
      const tenant = await app.prisma.tenant.findUnique({
        where: { slug: params.tenantSlug },
      });
      if (!tenant) {
        throw notFound("Tenant no encontrado");
      }

      return app.prisma.staff.findMany({
        where: { tenantId: tenant.id, active: true },
        orderBy: { displayName: "asc" },
      });
    });

    publicApp.get("/public/:tenantSlug/availability", async (request) => {
      const params = z.object({ tenantSlug: z.string() }).parse(request.params);
      const query = z
        .object({
          date: z.string(),
          staffId: z.string().uuid().optional(),
          serviceIds: z
            .string()
            .transform((value) => value.split(",").filter(Boolean))
            .optional(),
        })
        .parse(request.query);

      const tenant = await app.prisma.tenant.findUnique({
        where: { slug: params.tenantSlug },
        include: { settings: true },
      });
      if (!tenant) {
        throw notFound("Tenant no encontrado");
      }

      const { start, end } = dateBounds(query.date);

      const services = await app.prisma.service.findMany({
        where: {
          tenantId: tenant.id,
          active: true,
          id: query.serviceIds?.length ? { in: query.serviceIds } : undefined,
        },
      });

      const duration = services.length
        ? services.reduce(
            (sum: number, item: { durationMinutes: number }) =>
              sum + item.durationMinutes,
            0,
          )
        : 30;

      const staffMembers = await app.prisma.staff.findMany({
        where: {
          tenantId: tenant.id,
          active: true,
          id: query.staffId,
        },
      });

      const result: Array<{
        staffId: string;
        displayName: string;
        slots: { startAt: string; endAt: string }[];
      }> = [];

      for (const staff of staffMembers) {
        const [schedule, appointments] = await Promise.all([
          app.prisma.staffSchedule.findMany({
            where: {
              tenantId: tenant.id,
              staffId: staff.id,
              dayOfWeek: start.getDay(),
            },
          }),
          app.prisma.appointment.findMany({
            where: {
              tenantId: tenant.id,
              staffId: staff.id,
              status: { in: ["pending", "confirmed"] },
              startAt: { lt: end },
              endAt: { gt: start },
            },
          }),
        ]);

        const slots = buildAvailabilityForStaff(
          query.date,
          duration,
          schedule,
          appointments,
        );
        result.push({
          staffId: staff.id,
          displayName: staff.displayName,
          slots,
        });
      }

      return {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
        },
        durationMinutes: duration,
        data: result,
      };
    });

    publicApp.post(
      "/public/:tenantSlug/book",
      { preHandler: [requireBookingCustomerAuth] },
      async (request) => {
        const params = z
          .object({ tenantSlug: z.string() })
          .parse(request.params);
        const payload = bookSchema.parse(request.body);

        const tenant = await app.prisma.tenant.findUnique({
          where: { slug: params.tenantSlug },
        });
        if (!tenant) {
          throw notFound("Tenant no encontrado");
        }
        if (request.customerAuth?.tenantId !== tenant.id) {
          throw badRequest("Token de cliente no corresponde al tenant actual");
        }

        return createAppointment(app.prisma, {
          tenantId: tenant.id,
          source: "portal",
          enforceSingleActiveByPhone: true,
          staffId: payload.staffId,
          serviceIds: payload.serviceIds,
          startAt: new Date(payload.startAt),
          customerId: request.customerAuth?.customerId,
        });
      },
    );

    publicApp.get(
      "/public/:tenantSlug/my-appointments",
      { preHandler: [requireBookingCustomerAuth] },
      async (request) => {
        const params = z
          .object({ tenantSlug: z.string() })
          .parse(request.params);
        const tenant = await app.prisma.tenant.findUnique({
          where: { slug: params.tenantSlug },
        });
        if (!tenant) {
          throw notFound("Tenant no encontrado");
        }
        if (request.customerAuth?.tenantId !== tenant.id) {
          throw badRequest("Token de cliente no corresponde al tenant actual");
        }

        return app.prisma.appointment.findMany({
          where: {
            tenantId: tenant.id,
            customerId: request.customerAuth?.customerId,
            status: { in: ["pending", "confirmed"] },
            endAt: { gt: new Date() },
          },
          include: {
            staff: true,
            services: {
              include: {
                service: true,
              },
            },
          },
          orderBy: {
            startAt: "asc",
          },
        });
      },
    );

    publicApp.post(
      "/public/:tenantSlug/cancel",
      { preHandler: [requireBookingCustomerAuth] },
      async (request) => {
        const params = z
          .object({ tenantSlug: z.string() })
          .parse(request.params);
        const payload = cancelSchema.parse(request.body);

        const tenant = await app.prisma.tenant.findUnique({
          where: { slug: params.tenantSlug },
        });
        if (!tenant) {
          throw notFound("Tenant no encontrado");
        }
        if (request.customerAuth?.tenantId !== tenant.id) {
          throw badRequest("Token de cliente no corresponde al tenant actual");
        }

        const updated = await cancelAppointmentByCustomer(app.prisma, {
          tenantId: tenant.id,
          appointmentId: payload.appointmentId,
          customerId: request.customerAuth?.customerId,
        });

        return {
          ok: true,
          appointment: updated,
        };
      },
    );
  });
}
