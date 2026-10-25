import assert from "node:assert/strict";
import test from "node:test";
import type { Appointment, StaffSchedule } from "@prisma/client";
import { buildAvailabilityForStaff } from "../src/services/availability.js";

function schedule(
  startTime: string,
  endTime: string,
  breakJson: unknown = null,
): StaffSchedule {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenantId: "11111111-1111-1111-1111-111111111111",
    staffId: "22222222-2222-2222-2222-222222222222",
    dayOfWeek: 1,
    startTime,
    endTime,
    breakJson,
  } as StaffSchedule;
}

function appointment(startAt: Date, endAt: Date): Appointment {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    tenantId: "11111111-1111-1111-1111-111111111111",
    customerId: "44444444-4444-4444-4444-444444444444",
    staffId: "22222222-2222-2222-2222-222222222222",
    startAt,
    endAt,
    status: "confirmed",
    notes: null,
    cancellationReason: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test("genera intervalos cada 15 minutos dentro de la jornada", () => {
  const slots = buildAvailabilityForStaff(
    "2030-01-07",
    30,
    [schedule("09:00", "10:00")],
    [],
  );

  assert.equal(slots.length, 3);
  assert.deepEqual(
    slots.map((slot) => new Date(slot.startAt).getHours()),
    [9, 9, 9],
  );
  assert.deepEqual(
    slots.map((slot) => new Date(slot.startAt).getMinutes()),
    [0, 15, 30],
  );
});

test("excluye descansos y citas que se superponen", () => {
  const date = "2030-01-07";
  const existing = appointment(
    new Date(`${date}T09:00:00`),
    new Date(`${date}T09:30:00`),
  );
  const slots = buildAvailabilityForStaff(
    date,
    30,
    [schedule("09:00", "11:00", [{ start: "10:00", end: "10:30" }])],
    [existing],
  );

  assert.deepEqual(
    slots.map((slot) => new Date(slot.startAt).toTimeString().slice(0, 5)),
    ["09:30", "10:30"],
  );
});

test("no crea espacios que excedan el cierre", () => {
  const slots = buildAvailabilityForStaff(
    "2030-01-07",
    45,
    [schedule("09:00", "10:00")],
    [],
  );

  assert.equal(slots.length, 2);
  assert.equal(new Date(slots.at(-1)!.endAt).toTimeString().slice(0, 5), "10:00");
});
