import { DEFAULT_LOCALE, formatDateTime, formatTime } from "./time";

/** Eventos de cita que generan notificaciones. Fuente unica para API y worker. */
export const APPOINTMENT_EVENTS = {
  created: "appointment.created",
  confirmed: "appointment.confirmed",
  cancelled: "appointment.cancelled",
  cancelledByCustomer: "appointment.cancelled_by_customer",
  reminder24h: "appointment.reminder_24h",
  reminder2h: "appointment.reminder_2h",
  followup: "appointment.followup",
  noShowFollowup: "appointment.no_show_followup",
  manualTest: "appointment.manual_test",
} as const;

export type AppointmentEvent =
  (typeof APPOINTMENT_EVENTS)[keyof typeof APPOINTMENT_EVENTS];

export type AppointmentMessageContext = {
  customerName: string;
  staffName: string;
  startAt: Date;
  timeZone: string;
  locale?: string;
};

type MessageBuilder = (
  context: AppointmentMessageContext & { when: string; time: string },
) => string;

const MESSAGES: Record<AppointmentEvent, MessageBuilder> = {
  [APPOINTMENT_EVENTS.created]: (c) =>
    `Hola ${c.customerName}, tu cita con ${c.staffName} fue agendada para ${c.when}. Responde CONFIRMAR, REAGENDAR o CANCELAR.`,
  [APPOINTMENT_EVENTS.confirmed]: (c) =>
    `Tu cita con ${c.staffName} para ${c.when} quedó confirmada.`,
  [APPOINTMENT_EVENTS.cancelled]: (c) =>
    `Tu cita con ${c.staffName} para ${c.when} fue cancelada.`,
  [APPOINTMENT_EVENTS.cancelledByCustomer]: (c) =>
    `La cita con ${c.staffName} para ${c.when} fue cancelada correctamente.`,
  [APPOINTMENT_EVENTS.reminder24h]: (c) =>
    `Recordatorio: mañana tienes cita con ${c.staffName} a las ${c.time}. Responde CONFIRMAR, REAGENDAR o CANCELAR.`,
  [APPOINTMENT_EVENTS.reminder2h]: (c) =>
    `Tu cita con ${c.staffName} es hoy a las ${c.time}. Responde CANCELAR si ya no podrás asistir.`,
  [APPOINTMENT_EVENTS.followup]: (c) =>
    `Gracias por tu visita, ${c.customerName}. ¿Cómo fue tu experiencia? Responde con una calificación del 1 al 5.`,
  [APPOINTMENT_EVENTS.noShowFollowup]: (c) =>
    `Hola ${c.customerName}, notamos que no pudiste asistir a tu cita. Responde AGENDAR para encontrar un nuevo horario o ASESOR si necesitas ayuda.`,
  [APPOINTMENT_EVENTS.manualTest]: (c) =>
    `Prueba de notificación: cita con ${c.staffName} para ${c.when}.`,
};

export function isAppointmentEvent(value: string): value is AppointmentEvent {
  return value in MESSAGES;
}

export function appointmentMessage(
  event: AppointmentEvent,
  context: AppointmentMessageContext,
) {
  const locale = context.locale ?? DEFAULT_LOCALE;
  return MESSAGES[event]({
    ...context,
    when: formatDateTime(context.startAt, context.timeZone, locale),
    time: formatTime(context.startAt, context.timeZone, locale),
  });
}

/**
 * Variables de plantilla de una cita, ya formateadas en la zona horaria del negocio. Las
 * plantillas usan {{when}} (fecha y hora) o {{time}} (solo hora), nunca la fecha ISO.
 */
export function appointmentTemplateVariables(
  context: AppointmentMessageContext,
) {
  const locale = context.locale ?? DEFAULT_LOCALE;
  return {
    customerName: context.customerName,
    staffName: context.staffName,
    when: formatDateTime(context.startAt, context.timeZone, locale),
    time: formatTime(context.startAt, context.timeZone, locale),
  };
}

export type DefaultTemplate = {
  channel: "email" | "whatsapp";
  eventType: string;
  subject?: string;
  body: string;
  /** Plantilla aprobada por Meta con la que se envia por WhatsApp (ver ProviderTemplateConfig). */
  providerTemplate?: {
    evolution: {
      name: string;
      language: string;
      kind: "standard" | "authentication";
    };
  };
};

/** Plantillas con las que nace todo negocio; el negocio las edita desde Ajustes. */
export const DEFAULT_NOTIFICATION_TEMPLATES: DefaultTemplate[] = [
  {
    // Meta solo entrega codigos por WhatsApp con una plantilla de autenticacion aprobada.
    channel: "whatsapp",
    eventType: "auth.otp.requested",
    body: "Tu código de verificación es {{code}}. Vence en {{expiresInMinutes}} minutos.",
    providerTemplate: {
      evolution: {
        name: "codigo_verificacion",
        language: "es",
        kind: "authentication",
      },
    },
  },
  {
    channel: "email",
    eventType: APPOINTMENT_EVENTS.created,
    subject: "Tu cita quedó agendada",
    body: "Hola {{customerName}}, tu cita con {{staffName}} quedó agendada para {{when}}.",
  },
  {
    channel: "email",
    eventType: APPOINTMENT_EVENTS.reminder24h,
    subject: "Recordatorio de tu cita",
    body: "Hola {{customerName}}, te esperamos mañana a las {{time}} con {{staffName}}.",
  },
  {
    channel: "whatsapp",
    eventType: APPOINTMENT_EVENTS.reminder24h,
    body: "Hola {{customerName}}, te recordamos tu cita con {{staffName}} para {{when}}. Responde CONFIRMAR, REAGENDAR o CANCELAR.",
  },
  {
    channel: "whatsapp",
    eventType: APPOINTMENT_EVENTS.reminder2h,
    body: "Hola {{customerName}}, tu cita con {{staffName}} es hoy a las {{time}}.",
  },
  {
    channel: "whatsapp",
    eventType: APPOINTMENT_EVENTS.confirmed,
    body: "Tu cita con {{staffName}} para {{when}} quedó confirmada.",
  },
  {
    channel: "whatsapp",
    eventType: APPOINTMENT_EVENTS.cancelled,
    body: "Tu cita con {{staffName}} para {{when}} fue cancelada.",
  },
  {
    channel: "whatsapp",
    eventType: APPOINTMENT_EVENTS.followup,
    body: "Gracias por tu visita, {{customerName}}. ¿Cómo fue tu experiencia? Responde del 1 al 5.",
  },
  {
    channel: "whatsapp",
    eventType: APPOINTMENT_EVENTS.noShowFollowup,
    body: "Hola {{customerName}}, notamos que no pudiste asistir. Responde AGENDAR para encontrar un nuevo horario o ASESOR si necesitas ayuda.",
  },
];
