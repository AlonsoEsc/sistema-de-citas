import {
  breakdownAppointments,
  summarizeAppointments,
} from "@citas/shared/reports";
import { calendarDateIn, startOfMonthIn } from "@citas/shared/time";
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

/** Resumen del periodo con metricas, desglose por profesional, por dia y por servicio. */
export async function getOverview(
  { db }: TenantScope,
  tenant: Pick<TenantContext, "timezone">,
  range: { from: Date; to: Date },
) {
  const appointments = await db.appointment.findMany({
    where: { startAt: { gte: range.from }, endAt: { lte: range.to } },
    include: { staff: true, services: { include: { service: true } } },
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
    ...breakdownAppointments(
      appointments.map((item) => ({
        day: calendarDateIn(item.startAt, tenant.timezone),
        status: item.status,
        priceCents: item.priceCents,
        services: item.services.map((line) => ({
          serviceId: line.serviceId,
          name: line.service.name,
          priceCents: line.priceCents,
        })),
      })),
    ),
  };
}
