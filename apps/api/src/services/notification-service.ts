import type {
  Customer,
  NotificationChannel,
  Prisma,
  PrismaClient,
} from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

type AppointmentNotification = {
  id: string;
  tenantId: string;
  startAt: Date;
  endAt?: Date;
  status?: string;
  customer: Pick<Customer, "fullName" | "phone" | "email" | "whatsappOptOutAt">;
  staff: { displayName: string };
  services?: Array<{ service: { name: string } }>;
};

const eventMessages: Record<
  string,
  (appointment: AppointmentNotification) => string
> = {
  "appointment.created": (appointment) =>
    `Hola ${appointment.customer.fullName}, tu cita con ${appointment.staff.displayName} fue agendada para ${appointment.startAt.toLocaleString("es-SV")}. Responde CONFIRMAR, REAGENDAR o CANCELAR.`,
  "appointment.confirmed": (appointment) =>
    `Tu cita con ${appointment.staff.displayName} para ${appointment.startAt.toLocaleString("es-SV")} quedó confirmada.`,
  "appointment.cancelled": (appointment) =>
    `Tu cita con ${appointment.staff.displayName} para ${appointment.startAt.toLocaleString("es-SV")} fue cancelada.`,
  "appointment.reminder_24h": (appointment) =>
    `Recordatorio: mañana tienes cita con ${appointment.staff.displayName} a las ${appointment.startAt.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })}. Responde CONFIRMAR, REAGENDAR o CANCELAR.`,
  "appointment.reminder_2h": (appointment) =>
    `Tu cita con ${appointment.staff.displayName} es en aproximadamente 2 horas. Responde CANCELAR si ya no podrás asistir.`,
  "appointment.followup": (appointment) =>
    `Gracias por tu visita, ${appointment.customer.fullName}. ¿Cómo fue tu experiencia? Responde con una calificación del 1 al 5.`,
  "appointment.cancelled_by_customer": (appointment) =>
    `La cita con ${appointment.staff.displayName} para ${appointment.startAt.toLocaleString("es-SV")} fue cancelada correctamente.`,
};

function enabled(value: unknown, defaultValue = false) {
  return (value as { enabled?: boolean } | undefined)?.enabled ?? defaultValue;
}

export function normalizePhone(phone: string) {
  const clean = phone.replace(/[^\d+]/g, "");
  if (!clean) {
    return "";
  }
  return clean.startsWith("+") ? clean : `+${clean}`;
}

export async function enabledNotificationChannels(
  prisma: DbClient,
  tenantId: string,
  customer: Pick<Customer, "phone" | "email" | "whatsappOptOutAt">,
) {
  const rows = await prisma.tenantEntitlement.findMany({
    where: {
      tenantId,
      key: {
        in: [
          "notifications.email.enabled",
          "notifications.sms.enabled",
          "notifications.whatsapp.enabled",
        ],
      },
    },
  });
  const values = new Map(rows.map((row) => [row.key, row.valueJson]));
  const channels: NotificationChannel[] = [];

  if (
    customer.email &&
    enabled(values.get("notifications.email.enabled"), true)
  ) {
    channels.push("email");
  }
  if (customer.phone && enabled(values.get("notifications.sms.enabled"))) {
    channels.push("sms");
  }
  if (
    customer.phone &&
    !customer.whatsappOptOutAt &&
    enabled(values.get("notifications.whatsapp.enabled"))
  ) {
    channels.push("whatsapp");
  }

  return channels;
}

export async function queueAppointmentNotifications(
  prisma: DbClient,
  appointment: AppointmentNotification,
  eventType: string,
  options: {
    channels?: NotificationChannel[];
    scheduledFor?: Date;
    idempotencySuffix?: string;
  } = {},
) {
  const channels =
    options.channels ??
    (await enabledNotificationChannels(
      prisma,
      appointment.tenantId,
      appointment.customer,
    ));
  const message =
    eventMessages[eventType]?.(appointment) ??
    `Notificación de cita para ${appointment.startAt.toLocaleString("es-SV")}.`;

  const created = [];
  for (const channel of channels) {
    const to =
      channel === "email"
        ? appointment.customer.email
        : appointment.customer.phone;
    if (!to) {
      continue;
    }
    const idempotencyKey = [
      appointment.tenantId,
      appointment.id,
      eventType,
      channel,
      options.idempotencySuffix ?? "default",
    ].join(":");

    const row = await prisma.notificationOutbox.upsert({
      where: { idempotencyKey },
      create: {
        tenantId: appointment.tenantId,
        channel,
        eventType,
        to: channel === "email" ? to : normalizePhone(to),
        idempotencyKey,
        scheduledFor: options.scheduledFor,
        payloadJson: {
          appointmentId: appointment.id,
          customerName: appointment.customer.fullName,
          staffName: appointment.staff.displayName,
          services:
            appointment.services?.map((item) => item.service.name) ?? [],
          startAt: appointment.startAt.toISOString(),
          endAt: appointment.endAt?.toISOString(),
          status: appointment.status,
          message,
        },
      },
      update: {},
    });
    created.push(row);
  }
  return created;
}

export async function queueWhatsappReply(
  prisma: DbClient,
  input: {
    tenantId: string;
    phone: string;
    message: string;
    eventType?: string;
    idempotencyKey: string;
    appointmentId?: string;
  },
) {
  return prisma.notificationOutbox.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      tenantId: input.tenantId,
      channel: "whatsapp",
      eventType: input.eventType ?? "whatsapp.assistant.reply",
      to: normalizePhone(input.phone),
      idempotencyKey: input.idempotencyKey,
      payloadJson: {
        message: input.message,
        appointmentId: input.appointmentId,
      },
    },
    update: {},
  });
}
