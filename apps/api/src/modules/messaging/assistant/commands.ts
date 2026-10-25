import { addCalendarDays, isCalendarDate, todayIn } from "@citas/shared/time";

/** Texto del cliente sin acentos, en minusculas y sin espacios extremos. */
export function normalizeCommand(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Palabras clave que entiende el asistente (ya normalizadas). */
export const COMMANDS = {
  optOut: ["stop", "baja", "salir", "no mensajes", "cancelar suscripcion"],
  optIn: ["alta", "activar", "iniciar mensajes"],
  handoff: ["asesor", "humano", "recepcion", "persona"],
  resumeBot: ["bot", "menu"],
  resetFlow: ["menu", "cancelar proceso"],
  confirmStep: ["confirmar", "confirmo", "si"],
  changeBookingDate: ["cambiar", "reagendar", "otra fecha"],
  changeRescheduleDate: ["cambiar", "otra fecha"],
  confirmAppointment: ["confirmar", "confirmo", "si confirmo", "1"],
  cancelAppointment: ["cancelar", "cancelo", "3"],
  rescheduleAppointment: ["reagendar", "cambiar cita", "2"],
  startBooking: ["agendar", "reservar", "nueva cita", "cita"],
} as const satisfies Record<string, readonly string[]>;

export function isCommand(
  command: string,
  keywords: (typeof COMMANDS)[keyof typeof COMMANDS],
) {
  return (keywords as readonly string[]).includes(command);
}

/** Posicion elegida en una lista numerada (1..length), o -1 si no es valida. */
export function selectedIndex(command: string, length: number) {
  const value = Number.parseInt(command, 10);
  return Number.isInteger(value) && value >= 1 && value <= length
    ? value - 1
    : -1;
}

/** Interpreta HOY, MAÑANA, DD/MM/AAAA o AAAA-MM-DD en la zona horaria del negocio. */
export function parseRequestedDate(
  text: string,
  timeZone: string,
  now = new Date(),
) {
  const command = normalizeCommand(text);
  if (command === "hoy") {
    return todayIn(timeZone, now);
  }
  if (command === "manana") {
    return addCalendarDays(todayIn(timeZone, now), 1);
  }
  const slashDate = command.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const value = slashDate
    ? `${slashDate[3]}-${slashDate[2].padStart(2, "0")}-${slashDate[1].padStart(2, "0")}`
    : command;
  return isCalendarDate(value) ? value : undefined;
}
