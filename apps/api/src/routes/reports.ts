import type { Appointment, Staff } from "@citas/db";
import type { FastifyInstance } from "fastify";
import dayjs from "dayjs";
import { z } from "zod";
import { PERMISSIONS, requireAuth, requirePermission } from "../lib/auth.js";

export async function reportRoutes(app: FastifyInstance) {
  app.get(
    "/reports/overview",
    { preHandler: [requireAuth, requirePermission(PERMISSIONS.reportsView)] },
    async (request) => {
      const query = z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
        })
        .parse(request.query);

      const from = query.from ? dayjs(query.from) : dayjs().startOf("month");
      const to = query.to ? dayjs(query.to) : dayjs().endOf("month");

      const appointments: Array<Appointment & { staff: Staff }> =
        await app.prisma.appointment.findMany({
          where: {
            tenantId: request.tenantId,
            startAt: { gte: from.toDate() },
            endAt: { lte: to.toDate() },
          },
          include: { staff: true },
        });

      const totalRevenue = appointments
        .filter(
          (item) => item.status === "completed" || item.status === "confirmed",
        )
        .reduce((sum: number, item) => sum + item.priceCents, 0);
      const noShows = appointments.filter(
        (item) => item.status === "no_show",
      ).length;

      const byStaff = new Map<
        string,
        {
          staffId: string;
          name: string;
          revenueCents: number;
          appointments: number;
        }
      >();
      for (const item of appointments) {
        const previous = byStaff.get(item.staffId) ?? {
          staffId: item.staffId,
          name: item.staff.displayName,
          revenueCents: 0,
          appointments: 0,
        };
        previous.appointments += 1;
        if (item.status === "completed" || item.status === "confirmed") {
          previous.revenueCents += item.priceCents;
        }
        byStaff.set(item.staffId, previous);
      }

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        metrics: {
          totalAppointments: appointments.length,
          totalRevenueCents: totalRevenue,
          noShows,
          cancellationRate:
            appointments.length === 0
              ? 0
              : appointments.filter((item) => item.status === "cancelled")
                  .length / appointments.length,
        },
        byStaff: Array.from(byStaff.values()).sort(
          (a, b) => b.revenueCents - a.revenueCents,
        ),
      };
    },
  );
}
