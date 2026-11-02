import {
  countWhatsappMessagesSince,
  type Prisma,
  type PrismaClient,
} from "@citas/db";
import {
  ENTITLEMENTS,
  evaluateSubscription,
  isEnabled,
  mergeEntitlements,
} from "@citas/shared/billing";
import {
  APPOINTMENT_EVENTS,
  appointmentMessage,
  appointmentTemplateVariables,
  type AppointmentEvent,
} from "@citas/shared/notifications";
import { startOfMonthIn } from "@citas/shared/time";

const HOUR_MS = 60 * 60_000;
/** Si el worker estuvo detenido, recupera recordatorios atrasados hasta este margen. */
const CATCH_UP_MS = 30 * 60_000;

type Window = { event: AppointmentEvent; from: Date; to: Date };

/**
 * Ventanas de recordatorio para un ciclo del worker: citas que empiezan dentro de 24 h y de
 * 2 h (con margen de recuperacion).
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

const withContext = {
  customer: true,
  staff: true,
  tenant: {
    include: { subscription: { include: { plan: true } }, entitlements: true },
  },
} satisfies Prisma.AppointmentInclude;

type AppointmentWithContext = Prisma.AppointmentGetPayload<{
  include: typeof withContext;
}>;
type TenantWithPlan = AppointmentWithContext["tenant"];

/** Clientes contactables por WhatsApp en negocios activos (no suspendidos). */
const reachable = {
  customer: { phone: { not: null }, whatsappOptOutAt: null },
  tenant: { status: "active" },
} satisfies Prisma.AppointmentWhereInput;

/** Cuantos mensajes automaticos de WhatsApp puede enviar todavia el negocio este mes. */
async function remainingWhatsappQuota(
  prisma: PrismaClient,
  tenant: TenantWithPlan,
  now: Date,
) {
  const subscription = tenant.subscription;
  const entitlements = mergeEntitlements(
    subscription?.plan.featuresJson,
    tenant.entitlements,
  );
  if (
    evaluateSubscription(subscription, now).access !== "full" ||
    !isEnabled(entitlements, ENTITLEMENTS.whatsappNotifications)
  ) {
    return 0;
  }
  const used = await countWhatsappMessagesSince(
    prisma,
    tenant.id,
    startOfMonthIn(tenant.timezone, now),
  );
  return Math.max(0, (subscription?.plan.whatsappMessagesPerMonth ?? 0) - used);
}

/** Encola un evento para las citas de cada negocio, sin exceder su cupo mensual. */
async function enqueue(
  prisma: PrismaClient,
  event: AppointmentEvent,
  appointments: AppointmentWithContext[],
  now: Date,
) {
  const byTenant = new Map<string, AppointmentWithContext[]>();
  for (const appointment of appointments) {
    byTenant.set(appointment.tenantId, [
      ...(byTenant.get(appointment.tenantId) ?? []),
      appointment,
    ]);
  }

  let queued = 0;
  for (const rows of byTenant.values()) {
    const quota = await remainingWhatsappQuota(prisma, rows[0].tenant, now);
    const allowed = rows.slice(0, quota);
    if (!allowed.length) {
      continue;
    }
    const result = await prisma.notificationOutbox.createMany({
      data: allowed.map((appointment) => {
        const context = {
          customerName: appointment.customer.fullName,
          staffName: appointment.staff.displayName,
          startAt: appointment.startAt,
          timeZone: appointment.tenant.timezone,
          locale: appointment.tenant.locale,
        };
        return {
          tenantId: appointment.tenantId,
          channel: "whatsapp" as const,
          eventType: event,
          to: appointment.customer.phone as string,
          // Misma clave que versiones anteriores: no se reenvia lo que ya estaba encolado.
          idempotencyKey: `${appointment.tenantId}:${appointment.id}:${event}:whatsapp`,
          scheduledFor: now,
          payloadJson: {
            ...appointmentTemplateVariables(context),
            appointmentId: appointment.id,
            startAt: appointment.startAt.toISOString(),
            endAt: appointment.endAt.toISOString(),
            message: appointmentMessage(event, context),
          },
        };
      }),
      skipDuplicates: true,
    });
    queued += result.count;
  }
  return queued;
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
        ...reachable,
        status: { in: ["pending", "confirmed"] },
        startAt: { gte: window.from, lt: window.to },
      },
      include: withContext,
      orderBy: { startAt: "asc" },
    });
    queued += await enqueue(prisma, window.event, appointments, now);
  }

  const completed = await prisma.appointment.findMany({
    where: {
      ...reachable,
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
      ...reachable,
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
