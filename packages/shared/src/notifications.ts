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
