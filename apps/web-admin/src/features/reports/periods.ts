import { addCalendarDays, zonedDayRange } from "@citas/shared/time";

export type PeriodKey = "this_month" | "last_month" | "last_7" | "last_30";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  this_month: "Este mes",
  last_month: "Mes anterior",
  last_7: "Últimos 7 días",
  last_30: "Últimos 30 días",
};

function firstOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function shiftMonth(firstDay: string, months: number) {
  const [year, month] = firstDay.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

/**
 * Rango de fechas de calendario [fromDate, toDate) de un periodo, contado desde `today`
 * (fecha del negocio). Los "ultimos N dias" incluyen hoy.
 */
export function periodDates(period: PeriodKey, today: string) {
  switch (period) {
    case "this_month": {
      const from = firstOfMonth(today);
      return { fromDate: from, toDate: shiftMonth(from, 1) };
    }
    case "last_month": {
      const to = firstOfMonth(today);
      return { fromDate: shiftMonth(to, -1), toDate: to };
    }
    case "last_7":
      return {
        fromDate: addCalendarDays(today, -6),
        toDate: addCalendarDays(today, 1),
      };
    case "last_30":
      return {
        fromDate: addCalendarDays(today, -29),
        toDate: addCalendarDays(today, 1),
      };
  }
}

/** Instantes ISO del periodo en la zona horaria del negocio, listos para la API. */
export function periodRange(
  period: PeriodKey,
  today: string,
  timeZone: string,
) {
  const { fromDate, toDate } = periodDates(period, today);
  return {
    from: zonedDayRange(fromDate, timeZone).start.toISOString(),
    to: zonedDayRange(toDate, timeZone).start.toISOString(),
  };
}

/** Todas las fechas del periodo, para que la grafica muestre tambien los dias sin citas. */
export function datesBetween(fromDate: string, toDate: string) {
  const dates: string[] = [];
  for (let date = fromDate; date < toDate; date = addCalendarDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}
