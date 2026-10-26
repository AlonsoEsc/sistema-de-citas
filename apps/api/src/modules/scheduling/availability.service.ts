import {
  addCalendarDays,
  calendarDateIn,
  calendarDayOfWeek,
  isCalendarDate,
  todayIn,
  zonedDayRange,
} from "@citas/shared/time";
import { badRequest, conflict } from "../../shared/errors.js";
import type { TenantTxScope } from "../../shared/tenant-scope.js";
import type { TenantContext } from "../tenancy/tenant-context.js";
import { buildAvailabilityForStaff, type Slot } from "./availability.js";

export const ACTIVE_APPOINTMENT_STATUSES = ["pending", "confirmed"] as const;

type AvailabilityQuery = {
  date: string;
  serviceIds: string[];
  staffId?: string;
  excludeAppointmentId?: string;
  /** Solo devuelve espacios que empiezan despues de este instante (por defecto, ahora). */
  notBefore?: Date;
};

export type StaffAvailability = {
  staffId: string;
  displayName: string;
  slots: Slot[];
};

/** Servicios activos solicitados y su duracion total. Falla si alguno no es valido. */
export async function resolveServices(
  { db }: TenantTxScope,
  serviceIds: string[],
) {
  const uniqueIds = [...new Set(serviceIds)];
  if (!uniqueIds.length) {
    throw badRequest("Debes seleccionar al menos un servicio");
  }
  const services = await db.service.findMany({
    where: { id: { in: uniqueIds }, active: true },
  });
  if (services.length !== uniqueIds.length) {
    throw badRequest("Uno o mas servicios no son validos", "INVALID_SERVICES");
  }
  return {
    services,
    durationMinutes: services.reduce(
      (sum, item) => sum + item.durationMinutes,
      0,
    ),
    priceCents: services.reduce((sum, item) => sum + item.priceCents, 0),
  };
}

export function isWithinBookingWindow(
  tenant: TenantContext,
  date: string,
  now = new Date(),
) {
  const today = todayIn(tenant.timezone, now);
  return (
    date >= today && date <= addCalendarDays(today, tenant.bookingWindowDays)
  );
}

export async function getAvailability(
  scope: TenantTxScope,
  tenant: TenantContext,
  query: AvailabilityQuery,
) {
  if (!isCalendarDate(query.date)) {
    throw badRequest(
      "La fecha debe tener el formato AAAA-MM-DD",
      "INVALID_DATE",
    );
  }
  const { db } = scope;
  const { durationMinutes } = await resolveServices(scope, query.serviceIds);
  const { start, end } = zonedDayRange(query.date, tenant.timezone);
  const notBefore = (query.notBefore ?? new Date()).getTime();

  const staffMembers = await db.staff.findMany({
    where: { active: true, id: query.staffId },
    orderBy: { displayName: "asc" },
  });
  const staffIds = staffMembers.map((member) => member.id);
  const [schedules, appointments] = await Promise.all([
    db.staffSchedule.findMany({
      where: {
        staffId: { in: staffIds },
        dayOfWeek: calendarDayOfWeek(query.date),
      },
    }),
    db.appointment.findMany({
      where: {
        staffId: { in: staffIds },
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        id: query.excludeAppointmentId
          ? { not: query.excludeAppointmentId }
          : undefined,
        startAt: { lt: end },
        endAt: { gt: start },
      },
      select: { staffId: true, startAt: true, endAt: true },
    }),
  ]);

  const staff: StaffAvailability[] = staffMembers.map((member) => ({
    staffId: member.id,
    displayName: member.displayName,
    slots: buildAvailabilityForStaff(
      query.date,
      durationMinutes,
      schedules.filter((item) => item.staffId === member.id),
      appointments.filter((item) => item.staffId === member.id),
      tenant.timezone,
    ).filter((slot) => new Date(slot.startAt).getTime() > notBefore),
  }));

  return { durationMinutes, staff };
}

/**
 * Regla para reservas hechas por clientes (portal y WhatsApp): el inicio debe coincidir con
 * un espacio libre de la jornada del profesional, dentro de la ventana de reserva del negocio.
 */
export async function assertBookableSlot(
  scope: TenantTxScope,
  tenant: TenantContext,
  input: {
    staffId: string;
    serviceIds: string[];
    startAt: Date;
    excludeAppointmentId?: string;
  },
) {
  const date = calendarDateIn(input.startAt, tenant.timezone);
  if (!isWithinBookingWindow(tenant, date)) {
    throw badRequest(
      `Solo se puede reservar entre hoy y los proximos ${tenant.bookingWindowDays} dias`,
      "OUTSIDE_BOOKING_WINDOW",
    );
  }
  const { staff } = await getAvailability(scope, tenant, {
    date,
    serviceIds: input.serviceIds,
    staffId: input.staffId,
    excludeAppointmentId: input.excludeAppointmentId,
  });
  const requested = input.startAt.getTime();
  const available = staff[0]?.slots.some(
    (slot) => new Date(slot.startAt).getTime() === requested,
  );
  if (!available) {
    throw conflict(
      "Ese horario no esta disponible. Elige otro de la lista.",
      "SLOT_NOT_AVAILABLE",
    );
  }
}
