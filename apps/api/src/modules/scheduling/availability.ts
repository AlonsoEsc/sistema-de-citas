import type { StaffSchedule } from "@citas/db";
import {
  minutesToWallTime,
  wallTimeToMinutes,
  zonedDateTime,
} from "@citas/shared/time";

export const SLOT_STEP_MINUTES = 15;

export type ScheduleSegment = Pick<
  StaffSchedule,
  "startTime" | "endTime" | "breakJson"
>;
export type BusyInterval = { startAt: Date; endAt: Date };
export type Slot = { startAt: string; endAt: string };

type BreakRange = { start: number; end: number };

function breaksOf(breakJson: unknown): BreakRange[] {
  if (!Array.isArray(breakJson)) {
    return [];
  }
  return breakJson.flatMap((item) => {
    const { start, end } = (item ?? {}) as { start?: string; end?: string };
    return start && end
      ? [{ start: wallTimeToMinutes(start), end: wallTimeToMinutes(end) }]
      : [];
  });
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

/**
 * Espacios libres de un profesional en una fecha del negocio. Funcion pura: recibe la jornada
 * (hora local del negocio), las citas ocupadas (instantes UTC) y la zona horaria del negocio.
 */
export function buildAvailabilityForStaff(
  date: string,
  durationMinutes: number,
  schedule: ScheduleSegment[],
  busy: BusyInterval[],
  timeZone: string,
): Slot[] {
  const slots: Slot[] = [];

  for (const segment of schedule) {
    const segmentStart = wallTimeToMinutes(segment.startTime);
    const segmentEnd = wallTimeToMinutes(segment.endTime);
    const breaks = breaksOf(segment.breakJson);

    for (
      let minute = segmentStart;
      minute + durationMinutes <= segmentEnd;
      minute += SLOT_STEP_MINUTES
    ) {
      const slotEnd = minute + durationMinutes;
      if (
        breaks.some((item) => overlaps(minute, slotEnd, item.start, item.end))
      ) {
        continue;
      }

      const startAt = zonedDateTime(date, minutesToWallTime(minute), timeZone);
      const endAt = zonedDateTime(date, minutesToWallTime(slotEnd), timeZone);
      if (
        busy.some((item) =>
          overlaps(
            startAt.getTime(),
            endAt.getTime(),
            item.startAt.getTime(),
            item.endAt.getTime(),
          ),
        )
      ) {
        continue;
      }

      slots.push({
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });
    }
  }

  return slots;
}
