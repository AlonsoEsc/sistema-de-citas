import type { Subscription } from "@citas/db";

export const TRIAL_DAYS = 14;
export const TRIAL_PLAN_CODE = "negocio";
/** Dias de gracia tras vencer un periodo pagado antes de pasar a solo lectura. */
export const PAST_DUE_GRACE_DAYS = 3;

const DAY_MS = 86_400_000;

export type SubscriptionState =
  | "trialing"
  | "active"
  | "past_due"
  | "expired"
  | "canceled";

/**
 * full: el negocio opera con normalidad.
 * read_only: puede consultar y exportar, pero no crear ni modificar, y el portal no recibe
 * reservas. Aplica cuando vence la prueba o el pago (tras la gracia) o al cancelar.
 */
export type AccountAccess = "full" | "read_only";

export type SubscriptionEvaluation = {
  state: SubscriptionState;
  access: AccountAccess;
  /** Hasta cuando hay acceso completo (fin de prueba, de periodo o de gracia). */
  accessUntil: Date | null;
};

type SubscriptionDates = Pick<
  Subscription,
  "status" | "trialEndsAt" | "currentPeriodEnd"
>;

export function evaluateSubscription(
  subscription: SubscriptionDates | null | undefined,
  now = new Date(),
): SubscriptionEvaluation {
  if (!subscription) {
    return { state: "expired", access: "read_only", accessUntil: null };
  }
  const time = now.getTime();

  if (subscription.status === "trialing") {
    const ends = subscription.trialEndsAt;
    return ends && time < ends.getTime()
      ? { state: "trialing", access: "full", accessUntil: ends }
      : { state: "expired", access: "read_only", accessUntil: ends };
  }

  const periodEnd = subscription.currentPeriodEnd;
  if (subscription.status === "canceled") {
    return periodEnd && time < periodEnd.getTime()
      ? { state: "canceled", access: "full", accessUntil: periodEnd }
      : { state: "canceled", access: "read_only", accessUntil: periodEnd };
  }

  // active o past_due: el estado efectivo depende de la fecha, no de lo guardado.
  if (periodEnd && time < periodEnd.getTime()) {
    return { state: "active", access: "full", accessUntil: periodEnd };
  }
  const graceEnd = periodEnd
    ? new Date(periodEnd.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS)
    : null;
  return graceEnd && time < graceEnd.getTime()
    ? { state: "past_due", access: "full", accessUntil: graceEnd }
    : { state: "expired", access: "read_only", accessUntil: graceEnd };
}

export function trialEndDate(from = new Date()) {
  return new Date(from.getTime() + TRIAL_DAYS * DAY_MS);
}
