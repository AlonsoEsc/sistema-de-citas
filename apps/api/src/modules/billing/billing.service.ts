import type { PrismaClient } from "@citas/db";
import type { TenantScope } from "../../shared/tenant-scope.js";
import { whatsappUsage } from "../notifications/notification.service.js";
import type { TenantContext } from "../tenancy/tenant-context.js";

/** Planes que se ofrecen hoy, en el orden en que se muestran. */
export function listActivePlans(prisma: PrismaClient) {
  return prisma.plan.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: {
      code: true,
      name: true,
      priceCents: true,
      currency: true,
      billingPeriod: true,
      maxStaff: true,
      whatsappMessagesPerMonth: true,
      featuresJson: true,
    },
  });
}

/** Suscripcion del negocio con su estado efectivo (no solo el guardado). */
export async function getSubscriptionSummary(
  { db }: TenantScope,
  tenant: TenantContext,
) {
  const subscription = await db.subscription.findFirst({
    include: {
      plan: true,
      payments: { orderBy: { paidAt: "desc" }, take: 12 },
    },
  });
  if (!subscription) {
    return null;
  }
  return {
    status: subscription.status,
    state: tenant.subscription.state,
    access: tenant.access,
    accessUntil: tenant.subscription.accessUntil?.toISOString() ?? null,
    trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    plan: {
      code: subscription.plan.code,
      name: subscription.plan.name,
      priceCents: subscription.plan.priceCents,
      currency: subscription.plan.currency,
      billingPeriod: subscription.plan.billingPeriod,
    },
    payments: subscription.payments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      method: payment.method,
      reference: payment.reference,
      paidAt: payment.paidAt.toISOString(),
      periodStart: payment.periodStart.toISOString(),
      periodEnd: payment.periodEnd.toISOString(),
    })),
  };
}

/** Consumo del mes frente a los limites del plan. */
export async function getUsage(scope: TenantScope, tenant: TenantContext) {
  const [whatsapp, activeStaff] = await Promise.all([
    whatsappUsage(scope, tenant),
    scope.db.staff.count({ where: { active: true } }),
  ]);
  return {
    whatsappMessages: whatsapp,
    staff: { active: activeStaff, max: tenant.limits.maxStaff },
  };
}
