import type { AvailabilityResponse } from "../../lib/types";

export type BookableSlot = {
  startAt: string;
  staffId: string;
  staffName: string;
};

/**
 * Horarios a ofrecer. Con "cualquier profesional" la API devuelve los espacios de cada
 * uno: se ofrece cada hora una sola vez, asignada al primero que la tenga libre.
 */
export function bookableSlots(availability: AvailabilityResponse | undefined) {
  const byStart = new Map<string, BookableSlot>();
  for (const staff of availability?.data ?? []) {
    for (const slot of staff.slots) {
      if (!byStart.has(slot.startAt)) {
        byStart.set(slot.startAt, {
          startAt: slot.startAt,
          staffId: staff.staffId,
          staffName: staff.displayName,
        });
      }
    }
  }
  return [...byStart.values()].sort((a, b) =>
    a.startAt.localeCompare(b.startAt),
  );
}

/** Agrupa por parte del dia para que una lista larga de horas sea facil de recorrer. */
export function groupByDayPart(
  slots: BookableSlot[],
  hourOf: (iso: string) => number,
) {
  const groups = [
    { label: "Mañana", slots: [] as BookableSlot[] },
    { label: "Tarde", slots: [] as BookableSlot[] },
    { label: "Noche", slots: [] as BookableSlot[] },
  ];
  for (const slot of slots) {
    const hour = hourOf(slot.startAt);
    groups[hour < 12 ? 0 : hour < 18 ? 1 : 2].slots.push(slot);
  }
  return groups.filter((group) => group.slots.length > 0);
}
