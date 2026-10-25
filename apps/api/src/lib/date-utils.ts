import dayjs from "dayjs";

export function parseTimeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function combineDateAndMinutes(date: string, minutes: number): Date {
  const d = dayjs(`${date}T00:00:00`);
  return d.add(minutes, "minute").toDate();
}

export function toCurrency(valueCents: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  }).format(valueCents / 100);
}
