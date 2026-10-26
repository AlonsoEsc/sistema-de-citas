import { summarizeAppointments } from "@citas/shared/reports";
import { startOfMonthIn } from "@citas/shared/time";
import dayjs from "dayjs";
import type { TenantScope } from "../../shared/tenant-scope.js";
import type { TenantContext } from "../tenancy/tenant-context.js";

/** Mes en curso en la zona horaria del negocio. */
export function currentMonthRange(tenant: TenantContext, now = new Date()) {
  const from = startOfMonthIn(tenant.timezone, now);
  return {
    from,
    to: startOfMonthIn(
      tenant.timezone,
      dayjs(from).add(1, "month").add(1, "day").toDate(),
    ),
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
  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    ...summarizeAppointments(
      appointments.map((item) => ({
        status: item.status,
        priceCents: item.priceCents,
        staffId: item.staffId,
        staffName: item.staff.displayName,
      })),
    ),
  };
}
