import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAppointments } from "@citas/shared/reports";
import {
  nextReportRun,
  reportPeriod,
} from "../src/scheduler/report-schedule.js";
import { buildReportContent } from "../src/scheduler/scheduled-reports.js";

const tz = "America/El_Salvador";
// Miercoles 15 de enero de 2031, 10:00 en El Salvador (UTC-6).
const runAt = new Date("2031-01-15T16:00:00Z");

test("cada frecuencia cubre el periodo anterior en la zona del negocio", () => {
  assert.deepEqual(
    [
      reportPeriod("daily", runAt, tz).fromDate,
      reportPeriod("daily", runAt, tz).toDate,
    ],
    ["2031-01-14", "2031-01-15"],
  );
  assert.equal(reportPeriod("weekly", runAt, tz).fromDate, "2031-01-08");
  const monthly = reportPeriod("monthly", runAt, tz);
  assert.deepEqual(
    [monthly.fromDate, monthly.toDate],
    ["2030-12-01", "2031-01-01"],
  );
  assert.equal(monthly.from.toISOString(), "2030-12-01T06:00:00.000Z");
});

test("la proxima ejecucion es a las 07:00 locales", () => {
  assert.equal(
    nextReportRun("daily", runAt, tz).toISOString(),
    "2031-01-16T13:00:00.000Z",
  );
  assert.equal(
    nextReportRun("weekly", runAt, tz).toISOString(),
    "2031-01-20T13:00:00.000Z",
    "el lunes siguiente",
  );
  assert.equal(
    nextReportRun("monthly", runAt, tz).toISOString(),
    "2031-02-01T13:00:00.000Z",
  );
});

test("el reporte resume el periodo y escapa el CSV", () => {
  const content = buildReportContent({
    businessName: "Barberia QA",
    frequency: "daily",
    fromDate: "2031-01-14",
    toDate: "2031-01-15",
    currency: "USD",
    locale: "es-SV",
    summary: summarizeAppointments([
      {
        status: "completed",
        priceCents: 1200,
        staffId: "a",
        staffName: 'Ana "La Jefa"',
      },
      {
        status: "no_show",
        priceCents: 800,
        staffId: "a",
        staffName: 'Ana "La Jefa"',
      },
      {
        status: "confirmed",
        priceCents: 800,
        staffId: "b",
        staffName: "Luis, hijo",
      },
    ]),
  });
  assert.match(content.text, /Citas: 3/);
  assert.match(content.text, /No asistieron: 1/);
  assert.match(content.csv, /"Ana ""La Jefa""",2,12\.00/);
  assert.match(content.csv, /"Luis, hijo",1,8\.00/);
  assert.match(content.csv, /Total,3,20\.00/);
});
