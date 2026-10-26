import { describe, expect, it } from "vitest";
import { datesBetween, periodDates, periodRange } from "./periods";

describe("periodDates", () => {
  it("este mes y el anterior cruzan bien el cambio de anio", () => {
    expect(periodDates("this_month", "2026-12-15")).toEqual({
      fromDate: "2026-12-01",
      toDate: "2027-01-01",
    });
    expect(periodDates("last_month", "2027-01-10")).toEqual({
      fromDate: "2026-12-01",
      toDate: "2027-01-01",
    });
  });

  it("los ultimos 7 dias incluyen hoy", () => {
    expect(periodDates("last_7", "2026-10-25")).toEqual({
      fromDate: "2026-10-19",
      toDate: "2026-10-26",
    });
  });
});

describe("periodRange", () => {
  it("usa la medianoche del negocio, no la del navegador", () => {
    expect(
      periodRange("this_month", "2026-10-25", "America/El_Salvador"),
    ).toEqual({
      from: "2026-10-01T06:00:00.000Z",
      to: "2026-11-01T06:00:00.000Z",
    });
  });
});

describe("datesBetween", () => {
  it("lista cada dia del rango sin incluir el final", () => {
    expect(datesBetween("2026-02-27", "2026-03-02")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
  });
});
