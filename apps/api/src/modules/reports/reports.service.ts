import type { AppointmentStatus } from "@citas/db";
import { todayIn, zonedDayRange } from "@citas/shared/time";
import dayjs from "dayjs";
import type { TenantScope } from "../../shared/tenant-scope.js";
import type { TenantContext } from "../tenancy/tenant-context.js";

/** Estados que cuentan como ingreso (cita realizada o comprometida). */
const REVENUE_STATUSES: AppointmentStatus[] = ["completed", "confirmed"];

/** Mes en curso en la zona horaria del negocio. */
export function currentMonthRange(tenant: TenantContext, now = new Date()) {
  const today = todayIn(tenant.timezone, now);
  const firstDay = `${today.slice(0, 7)}-01`;
  const nextMonthFirstDay = dayjs(firstDay)
    .add(1, "month")
    .format("YYYY-MM-DD");
  return {
    from: zonedDayRange(firstDay, tenant.timezone).start,
    to: zonedDayRange(nextMonthFirstDay, tenant.timezone).start,
  };
}

export async function getOverview(
  { db }: TenantScope,
  range: { from: Date; to: Date },
) {
  const appointments = await db.appointment.findMany({
    where: { startAt: { gte: range.from }, endAt: { lte: range.to } },
    include: { staff: true },
  });

  const countsAsRevenue = (status: AppointmentStatus) =>
    REVENUE_STATUSES.includes(status);
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
    const row = byStaff.get(item.staffId) ?? {
      staffId: item.staffId,
      name: item.staff.displayName,
      revenueCents: 0,
      appointments: 0,
    };
    row.appointments += 1;
    if (countsAsRevenue(item.status)) {
      row.revenueCents += item.priceCents;
    }
    byStaff.set(item.staffId, row);
  }

  const total = appointments.length;
  const cancelled = appointments.filter(
    (item) => item.status === "cancelled",
  ).length;
  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    metrics: {
      totalAppointments: total,
      totalRevenueCents: appointments
        .filter((item) => countsAsRevenue(item.status))
        .reduce((sum, item) => sum + item.priceCents, 0),
      noShows: appointments.filter((item) => item.status === "no_show").length,
      cancellationRate: total === 0 ? 0 : cancelled / total,
    },
    byStaff: [...byStaff.values()].sort(
      (a, b) => b.revenueCents - a.revenueCents,
    ),
  };
}
