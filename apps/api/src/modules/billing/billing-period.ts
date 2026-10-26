import dayjs from "dayjs";
import type { Subscription } from "@citas/db";

/**
 * Periodo que cubre un pago de `months` meses. Si la suscripcion sigue vigente, el pago se
 * suma al final del periodo actual (pagar por adelantado no hace perder dias); si vencio o
 * estaba en prueba, empieza en la fecha del pago.
 */
export function nextBillingPeriod(
  subscription: Pick<Subscription, "status" | "currentPeriodEnd">,
  months: number,
  paidAt = new Date(),
) {
  const stillPaid =
    subscription.status !== "trialing" &&
    subscription.currentPeriodEnd !== null &&
    subscription.currentPeriodEnd.getTime() > paidAt.getTime();
  const start = stillPaid ? subscription.currentPeriodEnd! : paidAt;
  return {
    periodStart: start,
    periodEnd: dayjs(start).add(months, "month").toDate(),
  };
}
