import type { PrismaClient, SubscriptionStatus } from "@citas/db";

const DAY_MS = 86_400_000;

/** Asigna una suscripcion a un negocio de prueba (por defecto, Clinica activa por 30 dias). */
export async function grantSubscription(
  prisma: PrismaClient,
  tenantId: string,
  options: {
    planCode?: string;
    status?: SubscriptionStatus;
    trialEndsAt?: Date | null;
    currentPeriodEnd?: Date | null;
  } = {},
) {
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { code: options.planCode ?? "clinica" },
  });
  const data = {
    planId: plan.id,
    status: options.status ?? "active",
    trialEndsAt: options.trialEndsAt ?? null,
    currentPeriodStart: new Date(),
    currentPeriodEnd:
      options.currentPeriodEnd === undefined
        ? new Date(Date.now() + 30 * DAY_MS)
        : options.currentPeriodEnd,
  };
  return prisma.subscription.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  });
}
