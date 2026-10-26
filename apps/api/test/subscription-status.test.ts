import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSubscription,
  PAST_DUE_GRACE_DAYS,
} from "@citas/shared/billing";

const now = new Date("2030-06-15T12:00:00Z");
const days = (count: number) => new Date(now.getTime() + count * 86_400_000);

test("la prueba da acceso completo hasta su fecha de fin", () => {
  const trial = { status: "trialing" as const, currentPeriodEnd: null };
  assert.equal(
    evaluateSubscription({ ...trial, trialEndsAt: days(3) }, now).access,
    "full",
  );
  const expired = evaluateSubscription(
    { ...trial, trialEndsAt: days(-1) },
    now,
  );
  assert.deepEqual([expired.state, expired.access], ["expired", "read_only"]);
});

test("un periodo pagado vencido tiene dias de gracia antes de pasar a solo lectura", () => {
  const paid = (periodEnd: Date) =>
    evaluateSubscription(
      { status: "active", trialEndsAt: null, currentPeriodEnd: periodEnd },
      now,
    );
  assert.deepEqual(
    [paid(days(10)).state, paid(days(10)).access],
    ["active", "full"],
  );
  assert.deepEqual(
    [paid(days(-1)).state, paid(days(-1)).access],
    ["past_due", "full"],
  );
  const afterGrace = paid(days(-(PAST_DUE_GRACE_DAYS + 1)));
  assert.deepEqual(
    [afterGrace.state, afterGrace.access],
    ["expired", "read_only"],
  );
});

test("una cancelacion mantiene el acceso hasta el fin del periodo pagado", () => {
  const canceled = (periodEnd: Date) =>
    evaluateSubscription(
      { status: "canceled", trialEndsAt: null, currentPeriodEnd: periodEnd },
      now,
    ).access;
  assert.equal(canceled(days(5)), "full");
  assert.equal(canceled(days(-1)), "read_only");
});

test("sin suscripcion no hay acceso de escritura", () => {
  assert.equal(evaluateSubscription(null, now).access, "read_only");
});
