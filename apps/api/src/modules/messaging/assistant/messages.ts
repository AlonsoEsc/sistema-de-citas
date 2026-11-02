import { formatDateTime, formatTime } from "@citas/shared/time";

/** Textos del asistente. Toda la redaccion vive aqui para poder revisarla en un solo lugar. */

const DATE_HINT = "HOY, MAÑANA, DD/MM/AAAA o AAAA-MM-DD";

function numbered(items: string[]) {
  return items.map((item, position) => `${position + 1}. ${item}`).join("\n");
}

export const messages = {
  optedOut:
    "Listo. No enviaremos más mensajes automáticos por WhatsApp. Puedes escribir ALTA para reactivarlos.",
  optedIn: "Mensajes reactivados. Escribe MENU para ver las opciones.",
  handoff:
    "Te estamos transfiriendo con recepción. Un miembro del equipo continuará la conversación.",

  menu(input: {
    pushName?: string;
    tenantName: string;
    nextAppointment?: { startAt: Date; staffName: string; timeZone: string };
  }) {
    const appointmentLine = input.nextAppointment
      ? `\nTu próxima cita es ${formatDateTime(input.nextAppointment.startAt, input.nextAppointment.timeZone)} con ${input.nextAppointment.staffName}.`
      : "";
    return `Hola${input.pushName ? ` ${input.pushName}` : ""}. Soy el asistente de ${input.tenantName}.${appointmentLine}\n\nEscribe:\n1 o CONFIRMAR\n2 o REAGENDAR\n3 o CANCELAR\nAGENDAR para una nueva cita\nASESOR para hablar con recepción\nSTOP para dejar de recibir mensajes.`;
  },

  chooseService: (names: string[]) =>
    `Selecciona un servicio:\n${numbered(names)}\n\nResponde con el número o escribe CANCELAR PROCESO.`,
  invalidService: (names: string[]) =>
    `Selecciona un servicio respondiendo con su número:\n${numbered(names)}`,
  noServices: "No hay servicios disponibles. Escribe ASESOR.",
  chooseStaff: (names: string[]) => `Elige profesional:\n${numbered(names)}`,
  invalidStaff: (names: string[]) =>
    `Responde con el número del profesional:\n${numbered(names)}`,
  noStaff: "No hay profesionales disponibles. Escribe ASESOR.",
  chooseDate: `¿Para qué fecha deseas la cita? Responde ${DATE_HINT}.`,
  invalidDate: `Escribe ${DATE_HINT}.`,
  dateOutOfRange: (days: number) =>
    `La fecha debe estar entre hoy y los próximos ${days} días.`,
  noSlots:
    "No hay horarios disponibles ese día. Responde con otra fecha AAAA-MM-DD o escribe ASESOR.",
  chooseSlot: (slots: Date[], timeZone: string) =>
    `Elige horario:\n${numbered(slots.map((slot) => formatTime(slot, timeZone)))}`,
  invalidSlot: "Responde con el número de uno de los horarios mostrados.",
  askName: "Para terminar, escribe tu nombre completo.",
  invalidName: "Escribe tu nombre completo.",
  bookingSummary(input: {
    serviceName: string;
    staffName: string;
    startAt: Date;
    timeZone: string;
  }) {
    return [
      "Confirma los datos de tu cita:",
      `Servicio: ${input.serviceName}`,
      `Profesional: ${input.staffName}`,
      `Fecha y hora: ${formatDateTime(input.startAt, input.timeZone)}`,
      "",
      "Responde CONFIRMAR para reservar, CAMBIAR para elegir otra fecha o CANCELAR PROCESO.",
    ].join("\n");
  },
  changeDate: `Indica otra fecha: ${DATE_HINT}.`,
  bookingConfirmationInvalid:
    "Responde CONFIRMAR para reservar, CAMBIAR para elegir otra fecha o CANCELAR PROCESO.",
  booked: (startAt: Date, staffName: string, timeZone: string) =>
    `Cita reservada para ${formatDateTime(startAt, timeZone)} con ${staffName}. Responde CONFIRMAR para confirmar asistencia, REAGENDAR o CANCELAR.`,
  bookingConflict: (reason: string) =>
    `${reason}. Elige otra fecha o escribe MENU.`,

  rescheduleStart: `¿Para qué nueva fecha deseas la cita? Responde ${DATE_HINT}. Tu horario actual seguirá reservado hasta confirmar el cambio.`,
  rescheduleInvalidDate: `Escribe ${DATE_HINT} con la nueva fecha.`,
  rescheduleDateOutOfRange: (days: number) =>
    `La nueva fecha debe estar entre hoy y los próximos ${days} días.`,
  rescheduleNotFound: "La cita ya no está disponible para reagendar.",
  rescheduleNoSlots: "No hay horarios ese día. Escribe otra fecha AAAA-MM-DD.",
  rescheduleChooseSlot: (slots: Date[], timeZone: string) =>
    `Elige el nuevo horario:\n${numbered(slots.map((slot) => formatTime(slot, timeZone)))}`,
  rescheduleInvalidSlot: "Responde con el número del nuevo horario.",
  rescheduleSummary: (startAt: Date, timeZone: string) =>
    `Confirma el cambio de tu cita para ${formatDateTime(startAt, timeZone)}.\n\nResponde CONFIRMAR, CAMBIAR o CANCELAR PROCESO.`,
  rescheduleConfirmationInvalid:
    "Responde CONFIRMAR para aplicar el cambio, CAMBIAR para elegir otra fecha o CANCELAR PROCESO.",
  rescheduled: (startAt: Date, timeZone: string) =>
    `Cita reagendada para ${formatDateTime(startAt, timeZone)}.`,
  rescheduleConflict: "Ese horario acaba de ocuparse. Indica otra fecha.",
  rescheduleRequiresAgent: (minutes: number) =>
    `Esta cita requiere al menos ${minutes} minutos de anticipación para reagendarse en línea. Te comunicaremos con recepción.`,

  confirmed: (startAt: Date, staffName: string, timeZone: string) =>
    `Cita confirmada para ${formatDateTime(startAt, timeZone)} con ${staffName}.`,
  cancelled: (startAt: Date, timeZone: string) =>
    `Tu cita del ${formatDateTime(startAt, timeZone)} fue cancelada. Escribe AGENDAR para reservar otra.`,
  cancellationRequiresAgent: (reason: string) =>
    `${reason}. Te comunicaremos con recepción para revisar el caso.`,
  feedbackThanks: (rating: number) =>
    `Gracias por calificarnos con ${rating}/5. Tu opinión nos ayuda a mejorar.`,
};
