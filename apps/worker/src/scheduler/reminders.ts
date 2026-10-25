import type { Prisma, PrismaClient } from "@citas/db";
import {
  APPOINTMENT_EVENTS,
  appointmentMessage,
  type AppointmentEvent,
} from "@citas/shared/notifications";

const HOUR_MS = 60 * 60_000;
/** Si el worker estuvo detenido, recupera recordatorios atrasados hasta este margen. */
const CATCH_UP_MS = 30 * 60_000;

type Window = { event: AppointmentEvent; from: Date; to: Date };

/**
 * Ventanas de recordatorio para un ciclo del worker: citas que empiezan dentro de 24 h y de
 * 2 h (con margen de recuperacion), y citas ya terminadas para el seguimiento.
 */
export function reminderWindows(now: Date, pollIntervalMs: number): Window[] {
  const horizon = now.getTime() + pollIntervalMs + 5_000;
  return [
    {
      event: APPOINTMENT_EVENTS.reminder24h,
      from: new Date(now.getTime() + 24 * HOUR_MS - CATCH_UP_MS),
      to: new Date(horizon + 24 * HOUR_MS),
    },
    {
      event: APPOINTMENT_EVENTS.reminder2h,
      from: new Date(now.getTime() + 2 * HOUR_MS - CATCH_UP_MS),
      to: new Date(horizon + 2 * HOUR_MS),
    },
  ];
}

/** Negocios con WhatsApp habilitado y clientes que no se dieron de baja. */
const whatsappReachable = {
  customer: { phone: { not: null }, whatsappOptOutAt: null },
  tenant: {
    entitlements: {
      some: {
        key: "notifications.whatsapp.enabled",
        valueJson: { path: ["enabled"], equals: true },
      },
    },
  },
} satisfies Prisma.AppointmentWhereInput;

const withContext = { customer: true, staff: true, tenant: true } as const;

type AppointmentWithContext = Prisma.AppointmentGetPayload<{
  include: typeof withContext;
}>;

async function enqueue(
  prisma: PrismaClient,
  event: AppointmentEvent,
  appointments: AppointmentWithContext[],
  now: Date,
) {
  if (!appointments.length) {
    return 0;
  }
  const result = await prisma.notificationOutbox.createMany({
    data: appointments.map((appointment) => ({
      tenantId: appointment.tenantId,
      channel: "whatsapp" as const,
      eventType: event,
      to: appointment.customer.phone as string,
      // Misma clave que versiones anteriores: no se reenvia lo que ya estaba encolado.
      idempotencyKey: `${appointment.tenantId}:${appointment.id}:${event}:whatsapp`,
      scheduledFor: now,
      payloadJson: {
        appointmentId: appointment.id,
        customerName: appointment.customer.fullName,
        staffName: appointment.staff.displayName,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        message: appointmentMessage(event, {
          customerName: appointment.customer.fullName,
          staffName: appointment.staff.displayName,
          startAt: appointment.startAt,
          timeZone: appointment.tenant.timezone,
        }),
      },
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Encola recordatorios y seguimientos por WhatsApp. Es idempotente por cita y evento. */
export async function enqueueScheduledNotifications(
  prisma: PrismaClient,
  options: { now?: Date; pollIntervalMs: number },
) {
  const now = options.now ?? new Date();
  let queued = 0;

  for (const window of reminderWindows(now, options.pollIntervalMs)) {
    const appointments = await prisma.appointment.findMany({
      where: {
        ...whatsappReachable,
        status: { in: ["pending", "confirmed"] },
        startAt: { gte: window.from, lt: window.to },
      },
      include: withContext,
    });
    queued += await enqueue(prisma, window.event, appointments, now);
  }

  const completed = await prisma.appointment.findMany({
    where: {
      ...whatsappReachable,
      status: "completed",
      endAt: {
        gte: new Date(now.getTime() - 24 * HOUR_MS),
        lt: new Date(now.getTime() + options.pollIntervalMs - 2 * HOUR_MS),
      },
    },
    include: withContext,
  });
  queued += await enqueue(prisma, APPOINTMENT_EVENTS.followup, completed, now);

  const noShows = await prisma.appointment.findMany({
    where: {
      ...whatsappReachable,
      status: "no_show",
      endAt: { gte: new Date(now.getTime() - 7 * 24 * HOUR_MS), lt: now },
    },
    include: withContext,
  });
  queued += await enqueue(
    prisma,
    APPOINTMENT_EVENTS.noShowFollowup,
    noShows,
    now,
  );

  return queued;
}
