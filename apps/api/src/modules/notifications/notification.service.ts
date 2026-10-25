import type { Customer, NotificationChannel } from "@citas/db";
import {
  appointmentMessage,
  type AppointmentEvent,
} from "@citas/shared/notifications";
import { normalizePhone } from "@citas/shared/phone";
import type { TenantTxScope } from "../../shared/tenant-scope.js";
import {
  ENTITLEMENTS,
  isEnabled,
  loadEntitlements,
} from "../tenancy/entitlements.js";

type ContactInfo = Pick<Customer, "phone" | "email" | "whatsappOptOutAt">;

export type AppointmentForNotification = {
  id: string;
  startAt: Date;
  endAt?: Date;
  status?: string;
  customer: ContactInfo & Pick<Customer, "fullName">;
  staff: { displayName: string };
  services?: Array<{ service: { name: string } }>;
};

/** Canales por los que se puede contactar al cliente segun el plan y su consentimiento. */
export async function enabledNotificationChannels(
  { db }: TenantTxScope,
  customer: ContactInfo,
): Promise<NotificationChannel[]> {
  const entitlements = await loadEntitlements(db);
  const channels: NotificationChannel[] = [];
  if (
    customer.email &&
    isEnabled(entitlements, ENTITLEMENTS.emailNotifications, true)
  ) {
    channels.push("email");
  }
  if (
    customer.phone &&
    isEnabled(entitlements, ENTITLEMENTS.smsNotifications)
  ) {
    channels.push("sms");
  }
  if (
    customer.phone &&
    !customer.whatsappOptOutAt &&
    isEnabled(entitlements, ENTITLEMENTS.whatsappNotifications)
  ) {
    channels.push("whatsapp");
  }
  return channels;
}

/**
 * Encola una notificacion por canal en el outbox. Es idempotente: el mismo evento para la
 * misma cita y canal no se duplica (usa `idempotencySuffix` para eventos repetibles).
 */
export async function queueAppointmentNotifications(
  scope: TenantTxScope,
  timeZone: string,
  appointment: AppointmentForNotification,
  event: AppointmentEvent,
  options: {
    channels?: NotificationChannel[];
    scheduledFor?: Date;
    idempotencySuffix?: string;
  } = {},
) {
  const { db, tenantId } = scope;
  const channels =
    options.channels ??
    (await enabledNotificationChannels(scope, appointment.customer));
  const message = appointmentMessage(event, {
    customerName: appointment.customer.fullName,
    staffName: appointment.staff.displayName,
    startAt: appointment.startAt,
    timeZone,
  });

  const queued = [];
  for (const channel of channels) {
    const contact =
      channel === "email"
        ? appointment.customer.email
        : appointment.customer.phone;
    if (!contact) {
      continue;
    }
    const idempotencyKey = [
      tenantId,
      appointment.id,
      event,
      channel,
      options.idempotencySuffix ?? "default",
    ].join(":");

    queued.push(
      await db.notificationOutbox.upsert({
        where: { idempotencyKey },
        create: {
          tenantId,
          channel,
          eventType: event,
          to: channel === "email" ? contact : normalizePhone(contact),
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
      }),
    );
  }
  return queued;
}

export function queueWhatsappReply(
  { db, tenantId }: TenantTxScope,
  input: {
    phone: string;
    message: string;
    eventType?: string;
    idempotencyKey: string;
    appointmentId?: string;
  },
) {
  return db.notificationOutbox.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      tenantId,
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

export function queueOtpMessage(
  { db, tenantId }: TenantTxScope,
  input: {
    channel: Extract<NotificationChannel, "sms" | "whatsapp">;
    phone: string;
    code: string;
    expiresInMinutes: number;
  },
) {
  return db.notificationOutbox.create({
    data: {
      tenantId,
      channel: input.channel,
      eventType: "auth.otp.requested",
      to: input.phone,
      payloadJson: {
        code: input.code,
        message: `Tu codigo de verificacion es ${input.code}`,
        expiresInMinutes: input.expiresInMinutes,
      },
    },
  });
}
