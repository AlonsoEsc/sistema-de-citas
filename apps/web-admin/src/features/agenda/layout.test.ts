import { describe, expect, it } from "vitest";
import { placeInLanes, visibleHours, weekOf } from "./layout";

describe("placeInLanes", () => {
  it("una cita sola ocupa todo el ancho", () => {
    expect(placeInLanes([{ id: "a", start: 600, end: 630 }])).toEqual([
      { id: "a", start: 600, end: 630, lane: 0, lanes: 1 },
    ]);
  });

  it("citas que se cruzan se reparten en carriles", () => {
    const placed = placeInLanes([
      { id: "a", start: 600, end: 660 },
      { id: "b", start: 615, end: 630 },
      { id: "c", start: 630, end: 700 },
    ]);
    const byId = Object.fromEntries(placed.map((item) => [item.id, item]));
    expect(byId.a.lane).toBe(0);
    expect(byId.b.lane).toBe(1);
    // "c" empieza cuando "b" ya termino: reutiliza el carril de "b".
    expect(byId.c.lane).toBe(1);
    expect(placed.every((item) => item.lanes === 2)).toBe(true);
  });

  it("citas consecutivas no se consideran solapadas", () => {
    const placed = placeInLanes([
      { id: "a", start: 600, end: 630 },
      { id: "b", start: 630, end: 660 },
    ]);
    expect(placed.map((item) => [item.lane, item.lanes])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });
});

describe("visibleHours", () => {
  it("sin horarios muestra 08:00 a 19:00", () => {
    expect(visibleHours([])).toEqual({ start: 8, end: 19 });
  });

  it("cubre la jornada mas amplia del personal", () => {
    expect(
      visibleHours([
        { startTime: "09:30", endTime: "17:00" },
        { startTime: "08:00", endTime: "18:15" },
      ]),
    ).toEqual({ start: 8, end: 19 });
  });

  it("se amplia si una cita cae fuera de la jornada", () => {
    expect(
      visibleHours(
        [{ startTime: "09:00", endTime: "17:00" }],
        [{ start: 19 * 60, end: 20 * 60 + 30 }],
      ),
    ).toEqual({ start: 9, end: 21 });
  });
});

describe("weekOf", () => {
  it("devuelve de lunes a domingo", () => {
    // 2026-10-25 es domingo.
    expect(weekOf("2026-10-25")).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(weekOf("2026-10-26")[0]).toBe("2026-10-26");
  });
});
