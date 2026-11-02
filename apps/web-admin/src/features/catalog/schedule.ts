import { wallTimeToMinutes } from "@citas/shared/time";
import type { ScheduleBreak, ScheduleSegment } from "./api";

export type DayForm = {
  enabled: boolean;
  start: string;
  end: string;
  breaks: ScheduleBreak[];
};

/** Lunes primero, como se lee una semana laboral (0 = domingo en la API). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

const DEFAULT_DAY: DayForm = {
  enabled: false,
  start: "09:00",
  end: "18:00",
  breaks: [],
};

/**
 * Convierte el horario guardado en un formulario de un turno por dia. Si un dia tiene
 * varios turnos (p. ej. 8-12 y 14-18), se unen en uno y el hueco pasa a ser un descanso:
 * la disponibilidad resultante es la misma.
 */
export function toWeekForm(segments: ScheduleSegment[]): DayForm[] {
  return Array.from({ length: 7 }, (_, day) => {
    const ofDay = segments
      .filter((segment) => segment.dayOfWeek === day)
      .sort(
        (a, b) =>
          wallTimeToMinutes(a.startTime) - wallTimeToMinutes(b.startTime),
      );
    if (ofDay.length === 0) {
      return { ...DEFAULT_DAY, breaks: [] };
    }
    const breaks: ScheduleBreak[] = [];
    ofDay.forEach((segment, index) => {
      breaks.push(...(segment.breakJson ?? []));
      const next = ofDay[index + 1];
      if (next) {
        breaks.push({ start: segment.endTime, end: next.startTime });
      }
    });
    return {
      enabled: true,
      start: ofDay[0].startTime,
      end: ofDay[ofDay.length - 1].endTime,
      breaks,
    };
  });
}

export function fromWeekForm(days: DayForm[]): ScheduleSegment[] {
  return days.flatMap((day, dayOfWeek) =>
    day.enabled
      ? [
          {
            dayOfWeek,
            startTime: day.start,
            endTime: day.end,
            breakJson: day.breaks,
          },
        ]
      : [],
  );
}

/** Primer problema del formulario, en lenguaje del usuario, o null si es valido. */
export function scheduleProblem(days: DayForm[]): string | null {
  for (const dayOfWeek of WEEK_ORDER) {
    const day = days[dayOfWeek];
    if (!day.enabled) {
      continue;
    }
    const name = DAY_NAMES[dayOfWeek];
    const start = wallTimeToMinutes(day.start);
    const end = wallTimeToMinutes(day.end);
    if (!day.start || !day.end || end <= start) {
      return `${name}: la salida debe ser después de la entrada.`;
    }
    for (const item of day.breaks) {
      const breakStart = wallTimeToMinutes(item.start);
      const breakEnd = wallTimeToMinutes(item.end);
      if (breakEnd <= breakStart) {
        return `${name}: el descanso debe terminar después de empezar.`;
      }
      if (breakStart < start || breakEnd > end) {
        return `${name}: el descanso debe estar dentro de la jornada.`;
      }
    }
  }
  return null;
}

/** Resumen corto para la lista de personal: "Lun–Vie 09:00–18:00, Sáb 09:00–13:00". */
export function scheduleSummary(segments: ScheduleSegment[]) {
  const form = toWeekForm(segments);
  const groups: Array<{ days: number[]; hours: string }> = [];
  for (const day of WEEK_ORDER) {
    if (!form[day].enabled) {
      continue;
    }
    const hours = `${form[day].start}–${form[day].end}`;
    const last = groups.at(-1);
    const previousDay = last?.days.at(-1);
    const consecutive =
      previousDay !== undefined &&
      WEEK_ORDER.indexOf(day) === WEEK_ORDER.indexOf(previousDay) + 1;
    if (last && last.hours === hours && consecutive) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], hours });
    }
  }
  const short = (day: number) => DAY_NAMES[day].slice(0, 3);
  return groups
    .map(({ days, hours }) =>
      days.length > 1
        ? `${short(days[0])}–${short(days[days.length - 1])} ${hours}`
        : `${short(days[0])} ${hours}`,
    )
    .join(", ");
}
