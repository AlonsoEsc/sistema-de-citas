import assert from "node:assert/strict";
import test from "node:test";
import { buildAvailabilityForStaff } from "../src/modules/scheduling/availability.js";

const EL_SALVADOR = "America/El_Salvador";

function schedule(
  startTime: string,
  endTime: string,
  breakJson: Array<{ start: string; end: string }> | null = null,
) {
  return { startTime, endTime, breakJson };
}

/** Hora local "HH:mm" de un instante en la zona indicada. */
function localTime(iso: string, timeZone = EL_SALVADOR) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

test("genera intervalos cada 15 minutos dentro de la jornada", () => {
  const slots = buildAvailabilityForStaff(
    "2030-01-07",
    30,
    [schedule("09:00", "10:00")],
    [],
    EL_SALVADOR,
  );

  assert.deepEqual(
    slots.map((slot) => localTime(slot.startAt)),
    ["09:00", "09:15", "09:30"],
  );
});

test("excluye descansos y citas que se superponen", () => {
  const slots = buildAvailabilityForStaff(
    "2030-01-07",
    30,
    [schedule("09:00", "11:00", [{ start: "10:00", end: "10:30" }])],
    [
      {
        startAt: new Date("2030-01-07T15:00:00Z"),
        endAt: new Date("2030-01-07T15:30:00Z"),
      },
    ],
    EL_SALVADOR,
  );

  assert.deepEqual(
    slots.map((slot) => localTime(slot.startAt)),
    ["09:30", "10:30"],
  );
});

test("no crea espacios que excedan el cierre", () => {
  const slots = buildAvailabilityForStaff(
    "2030-01-07",
    45,
    [schedule("09:00", "10:00")],
    [],
    EL_SALVADOR,
  );

  assert.equal(slots.length, 2);
  assert.equal(localTime(slots.at(-1)!.endAt), "10:00");
});

test("usa la zona horaria del negocio, no la del servidor", () => {
  const [tokyo] = buildAvailabilityForStaff(
    "2030-01-07",
    30,
    [schedule("09:00", "09:30")],
    [],
    "Asia/Tokyo",
  );
  const [salvador] = buildAvailabilityForStaff(
    "2030-01-07",
    30,
    [schedule("09:00", "09:30")],
    [],
    EL_SALVADOR,
  );

  assert.equal(tokyo.startAt, "2030-01-07T00:00:00.000Z");
  assert.equal(salvador.startAt, "2030-01-07T15:00:00.000Z");
});
