import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Utilidades de fecha con zona horaria explicita. Las fechas de calendario ("YYYY-MM-DD") y
 * las horas de jornada ("HH:mm") son siempre hora local del negocio; los instantes (Date)
 * son UTC. Nunca se usa la zona horaria del servidor.
 */

export const DEFAULT_LOCALE = "es-SV";

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WALL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isCalendarDate(value: string) {
  return (
    CALENDAR_DATE.test(value) && dayjs.utc(value).format("YYYY-MM-DD") === value
  );
}

export function isWallTime(value: string) {
  return WALL_TIME.test(value);
}

export function wallTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToWallTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Instante UTC de una hora de jornada en una fecha de calendario del negocio. */
export function zonedDateTime(
  date: string,
  wallTime: string,
  timeZone: string,
) {
  return dayjs.tz(`${date}T${wallTime}:00`, timeZone).toDate();
}

/** Inicio (inclusive) y fin (exclusivo) del dia de calendario en la zona del negocio. */
export function zonedDayRange(date: string, timeZone: string) {
  const start = dayjs.tz(`${date}T00:00:00`, timeZone);
  return { start: start.toDate(), end: start.add(1, "day").toDate() };
}

/** Dia de la semana (0 = domingo) de una fecha de calendario. */
export function calendarDayOfWeek(date: string) {
  return dayjs.utc(date).day();
}

export function calendarDateIn(instant: Date, timeZone: string) {
  return dayjs(instant).tz(timeZone).format("YYYY-MM-DD");
}

/** Primer instante del mes en curso en la zona del negocio. */
export function startOfMonthIn(timeZone: string, now = new Date()) {
  const today = todayIn(timeZone, now);
  return zonedDayRange(`${today.slice(0, 7)}-01`, timeZone).start;
}

export function todayIn(timeZone: string, now = new Date()) {
  return calendarDateIn(now, timeZone);
}

export function addCalendarDays(date: string, days: number) {
  return dayjs.utc(date).add(days, "day").format("YYYY-MM-DD");
}

export function formatDateTime(
  instant: Date,
  timeZone: string,
  locale = DEFAULT_LOCALE,
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(instant);
}

export function formatTime(
  instant: Date,
  timeZone: string,
  locale = DEFAULT_LOCALE,
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}
