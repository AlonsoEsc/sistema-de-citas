import { describe, expect, it } from "vitest";
import {
  fromWeekForm,
  scheduleProblem,
  scheduleSummary,
  toWeekForm,
} from "./schedule";

describe("toWeekForm / fromWeekForm", () => {
  it("un turno partido se une y el hueco queda como descanso", () => {
    const form = toWeekForm([
      { dayOfWeek: 1, startTime: "14:00", endTime: "18:00" },
      { dayOfWeek: 1, startTime: "08:00", endTime: "12:00" },
    ]);
    expect(form[1]).toEqual({
      enabled: true,
      start: "08:00",
      end: "18:00",
      breaks: [{ start: "12:00", end: "14:00" }],
    });
    expect(form[0].enabled).toBe(false);
  });

  it("ida y vuelta conserva el horario", () => {
    const segments = [
      {
        dayOfWeek: 2,
        startTime: "09:00",
        endTime: "17:00",
        breakJson: [{ start: "13:00", end: "14:00" }],
      },
    ];
    expect(fromWeekForm(toWeekForm(segments))).toEqual(segments);
  });
});

describe("scheduleProblem", () => {
  it("detecta jornadas y descansos invalidos", () => {
    const form = toWeekForm([]);
    form[1] = { enabled: true, start: "18:00", end: "09:00", breaks: [] };
    expect(scheduleProblem(form)).toMatch(/Lunes/);

    form[1] = {
      enabled: true,
      start: "09:00",
      end: "17:00",
      breaks: [{ start: "16:30", end: "17:30" }],
    };
    expect(scheduleProblem(form)).toMatch(/dentro de la jornada/);

    form[1].breaks = [{ start: "13:00", end: "14:00" }];
    expect(scheduleProblem(form)).toBeNull();
  });
});

describe("scheduleSummary", () => {
  it("agrupa dias consecutivos con el mismo horario", () => {
    const weekdays = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: "09:00",
      endTime: "18:00",
    }));
    expect(
      scheduleSummary([
        ...weekdays,
        { dayOfWeek: 6, startTime: "09:00", endTime: "13:00" },
      ]),
    ).toBe("Lun–Vie 09:00–18:00, Sáb 09:00–13:00");
    expect(scheduleSummary([])).toBe("");
  });
});
