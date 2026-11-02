import { calendarDateIn } from "@citas/shared/time";

/** Datos del negocio necesarios para mostrar fechas y montos en su zona y moneda. */
export type Locality = {
  timezone: string;
  currency: string;
  locale: string;
};

export function formatMoney(
  cents: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function toDate(value: Date | string) {
  return typeof value === "string" ? new Date(value) : value;
}

/** Formateadores ligados a la zona horaria, moneda e idioma del negocio (no del navegador). */
export function createFormatter({ timezone, currency, locale }: Locality) {
  const format =
    (options: Intl.DateTimeFormatOptions) => (value: Date | string) =>
      new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        ...options,
      }).format(toDate(value));

  return {
    money: (cents: number) => formatMoney(cents, currency, locale),
    time: format({ hour: "numeric", minute: "2-digit" }),
    date: format({ day: "numeric", month: "short", year: "numeric" }),
    dayLabel: format({ weekday: "long", day: "numeric", month: "long" }),
    shortDay: format({ weekday: "short", day: "numeric" }),
    dateTime: format({
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
    /** Fecha de calendario (YYYY-MM-DD) de un instante en la zona del negocio. */
    calendarDate: (value: Date | string) =>
      calendarDateIn(toDate(value), timezone),
    /** Hora de pared (HH:mm) de un instante en la zona del negocio. */
    wallTime: (value: Date | string) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(toDate(value)),
    percent: (ratio: number) =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(ratio),
  };
}

export type Formatter = ReturnType<typeof createFormatter>;

/** Iniciales para avatares: "Ana María López" -> "AL". */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}
