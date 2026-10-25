import type { Appointment, StaffSchedule } from "@prisma/client";
import { combineDateAndMinutes, parseTimeToMinutes } from "../lib/date-utils.js";

const SLOT_STEP_MINUTES = 15;

function isInsideBreak(
  slotStartMinute: number,
  slotEndMinute: number,
  breakJson: unknown
): boolean {
  if (!Array.isArray(breakJson)) {
    return false;
  }

  return breakJson.some((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const data = item as { start?: string; end?: string };
    if (!data.start || !data.end) {
      return false;
    }

    const breakStart = parseTimeToMinutes(data.start);
    const breakEnd = parseTimeToMinutes(data.end);
    return slotStartMinute < breakEnd && slotEndMinute > breakStart;
  });
}

function overlapsExisting(slotStart: Date, slotEnd: Date, appointments: Appointment[]): boolean {
  return appointments.some((appointment) => slotStart < appointment.endAt && slotEnd > appointment.startAt);
}

export function buildAvailabilityForStaff(
  date: string,
  durationMinutes: number,
  schedule: StaffSchedule[],
  appointments: Appointment[]
) {
  const slots: { startAt: string; endAt: string }[] = [];

  for (const segment of schedule) {
    const segmentStart = parseTimeToMinutes(segment.startTime);
    const segmentEnd = parseTimeToMinutes(segment.endTime);

    for (let minute = segmentStart; minute + durationMinutes <= segmentEnd; minute += SLOT_STEP_MINUTES) {
      const slotEndMinute = minute + durationMinutes;

      if (isInsideBreak(minute, slotEndMinute, segment.breakJson)) {
        continue;
      }

      const slotStartAt = combineDateAndMinutes(date, minute);
      const slotEndAt = combineDateAndMinutes(date, slotEndMinute);

      if (overlapsExisting(slotStartAt, slotEndAt, appointments)) {
        continue;
      }

      slots.push({
        startAt: slotStartAt.toISOString(),
        endAt: slotEndAt.toISOString()
      });
    }
  }

  return slots;
}
