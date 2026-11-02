import {
  addCalendarDays,
  calendarDayOfWeek,
  todayIn,
  zonedDateTime,
} from "@citas/shared/time";

export type ReportFrequency = "daily" | "weekly" | "monthly";

/** Hora local del negocio a la que se envian los reportes. */
const SEND_TIME = "07:00";
const MONDAY = 1;

function firstOfMonth(date: string, monthOffset: number) {
  const [year, month] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  return target.toISOString().slice(0, 10);
}

/**
 * Periodo que cubre un reporte enviado en `runAt`: el dia anterior, los 7 dias anteriores
 * o el mes anterior, en la zona horaria del negocio. `to` es exclusivo.
 */
export function reportPeriod(
  frequency: ReportFrequency,
  runAt: Date,
  timeZone: string,
) {
  const today = todayIn(timeZone, runAt);
  const [fromDate, toDate] =
    frequency === "daily"
      ? [addCalendarDays(today, -1), today]
      : frequency === "weekly"
        ? [addCalendarDays(today, -7), today]
        : [firstOfMonth(today, -1), firstOfMonth(today, 0)];
  return {
    fromDate,
    toDate,
    from: zonedDateTime(fromDate, "00:00", timeZone),
    to: zonedDateTime(toDate, "00:00", timeZone),
  };
}

/** Proxima ejecucion: manana, el proximo lunes o el dia 1 del proximo mes, a las 07:00. */
export function nextReportRun(
  frequency: ReportFrequency,
  after: Date,
  timeZone: string,
) {
  const today = todayIn(timeZone, after);
  let date: string;
  if (frequency === "daily") {
    date = addCalendarDays(today, 1);
  } else if (frequency === "weekly") {
    const daysUntilMonday = (MONDAY - calendarDayOfWeek(today) + 7) % 7 || 7;
    date = addCalendarDays(today, daysUntilMonday);
  } else {
    date = firstOfMonth(today, 1);
  }
  return zonedDateTime(date, SEND_TIME, timeZone);
}

export function isReportFrequency(value: string): value is ReportFrequency {
  return value === "daily" || value === "weekly" || value === "monthly";
}
