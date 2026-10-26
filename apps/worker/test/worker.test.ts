import assert from "node:assert/strict";
import test from "node:test";
import { APPOINTMENT_EVENTS } from "@citas/shared/notifications";
import { interpolate } from "../src/outbox/render.js";
import {
  MAX_ATTEMPTS,
  retryDecision,
  retryDelayMinutes,
} from "../src/outbox/retry.js";
import { reminderWindows } from "../src/scheduler/reminders.js";

test("interpola variables de la plantilla con el payload", () => {
  assert.equal(
    interpolate(
      "Hola {{customerName}}, servicios: {{ services }}. {{falta}}!",
      {
        customerName: "Ana",
        services: ["Corte", "Barba"],
      },
    ),
    "Hola Ana, servicios: Corte, Barba. !",
  );
  assert.equal(interpolate("{{a.b}}", { a: { b: 5 } }), "5");
});

test("reintentos con backoff exponencial y limite de intentos", () => {
  assert.deepEqual([1, 2, 3, 6, 10].map(retryDelayMinutes), [2, 4, 8, 60, 60]);
  const now = new Date("2030-01-01T00:00:00Z");
  assert.equal(retryDecision(MAX_ATTEMPTS - 1, now).failed, false);
  assert.equal(retryDecision(MAX_ATTEMPTS, now).failed, true);
  assert.equal(
    retryDecision(1, now).nextRetryAt.toISOString(),
    "2030-01-01T00:02:00.000Z",
  );
});

test("las ventanas de recordatorio cubren 24 h y 2 h antes de la cita", () => {
  const now = new Date("2030-01-01T12:00:00Z");
  const [day, twoHours] = reminderWindows(now, 15_000);

  assert.equal(day.event, APPOINTMENT_EVENTS.reminder24h);
  assert.equal(twoHours.event, APPOINTMENT_EVENTS.reminder2h);
  const appointmentTomorrow = new Date("2030-01-02T12:00:00Z");
  assert.ok(day.from <= appointmentTomorrow && appointmentTomorrow < day.to);
  const appointmentInTwoHours = new Date("2030-01-01T14:00:00Z");
  assert.ok(
    twoHours.from <= appointmentInTwoHours &&
      appointmentInTwoHours < twoHours.to,
  );
});
