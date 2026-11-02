import {
  addCalendarDays,
  calendarDayOfWeek,
  wallTimeToMinutes,
} from "@citas/shared/time";

/** Intervalo en minutos desde la medianoche del dia (hora local del negocio). */
export type DayInterval = { id: string; start: number; end: number };

export type PlacedInterval = DayInterval & {
  /** Carril (columna) dentro del grupo de citas que se cruzan. */
  lane: number;
  /** Cantidad de carriles del grupo: el ancho de cada cita es 1 / lanes. */
  lanes: number;
};

/**
 * Reparte citas que se cruzan en carriles, como un calendario: cada grupo de citas
 * solapadas comparte el ancho y una cita reutiliza el primer carril que ya quedo libre.
 */
export function placeInLanes(intervals: DayInterval[]): PlacedInterval[] {
  const sorted = [...intervals].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const placed: PlacedInterval[] = [];
  let group: PlacedInterval[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = () => {
    for (const item of group) {
      item.lanes = laneEnds.length;
    }
    placed.push(...group);
    group = [];
    laneEnds = [];
  };

  for (const interval of sorted) {
    if (interval.start >= groupEnd) {
      closeGroup();
    }
    let lane = laneEnds.findIndex((end) => end <= interval.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(interval.end);
    } else {
      laneEnds[lane] = interval.end;
    }
    group.push({ ...interval, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, interval.end);
  }
  closeGroup();
  return placed;
}

const DEFAULT_HOURS = { start: 8, end: 19 };

/**
 * Horas visibles de la agenda: desde la primera entrada hasta la ultima salida del
 * personal, ampliadas si alguna cita cae fuera. Sin horarios, 08:00 a 19:00.
 */
export function visibleHours(
  schedules: Array<{ startTime: string; endTime: string }>,
  appointments: Array<{ start: number; end: number }> = [],
) {
  const starts = [
    ...schedules.map((item) => wallTimeToMinutes(item.startTime)),
    ...appointments.map((item) => item.start),
  ];
  const ends = [
    ...schedules.map((item) => wallTimeToMinutes(item.endTime)),
    ...appointments.map((item) => item.end),
  ];
  if (starts.length === 0) {
    return DEFAULT_HOURS;
  }
  const start = Math.floor(Math.min(...starts) / 60);
  const end = Math.ceil(Math.max(...ends) / 60);
  return {
    start: Math.max(0, Math.min(start, end - 1)),
    end: Math.min(24, Math.max(end, start + 1)),
  };
}

/** Los 7 dias (lunes a domingo) de la semana que contiene la fecha dada. */
export function weekOf(date: string) {
  const monday = addCalendarDays(date, -((calendarDayOfWeek(date) + 6) % 7));
  return Array.from({ length: 7 }, (_, index) =>
    addCalendarDays(monday, index),
  );
}
