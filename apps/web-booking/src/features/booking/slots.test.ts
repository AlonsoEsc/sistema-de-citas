import { describe, expect, it } from "vitest";
import { bookableSlots, groupByDayPart } from "./slots";

const slot = (startAt: string) => ({ startAt, endAt: startAt });

describe("bookableSlots", () => {
  it("ofrece cada hora una vez y la asigna al primer profesional libre", () => {
    const slots = bookableSlots({
      durationMinutes: 30,
      data: [
        {
          staffId: "a",
          displayName: "Ana",
          slots: [slot("2026-10-27T16:00:00.000Z")],
        },
        {
          staffId: "b",
          displayName: "Beto",
          slots: [
            slot("2026-10-27T15:30:00.000Z"),
            slot("2026-10-27T16:00:00.000Z"),
          ],
        },
      ],
    });
    expect(slots).toEqual([
      { startAt: "2026-10-27T15:30:00.000Z", staffId: "b", staffName: "Beto" },
      { startAt: "2026-10-27T16:00:00.000Z", staffId: "a", staffName: "Ana" },
    ]);
  });

  it("sin respuesta no hay horarios", () => {
    expect(bookableSlots(undefined)).toEqual([]);
  });
});

describe("groupByDayPart", () => {
  it("separa mañana, tarde y noche y omite grupos vacios", () => {
    const hours: Record<string, number> = { a: 9, b: 14, c: 15 };
    const groups = groupByDayPart(
      ["a", "b", "c"].map((id) => ({
        startAt: id,
        staffId: "x",
        staffName: "X",
      })),
      (iso) => hours[iso],
    );
    expect(groups.map((group) => [group.label, group.slots.length])).toEqual([
      ["Mañana", 1],
      ["Tarde", 2],
    ]);
  });
});
