import type { Prisma, PrismaClient } from "@citas/db";
import { badRequest, notFound } from "../../shared/errors.js";
import { notFoundIfMissing } from "../../shared/prisma-errors.js";
import { recordAudit } from "../audit/audit.service.js";
import { nextBillingPeriod } from "../billing/billing-period.js";
import { evaluateSubscription } from "@citas/shared/billing";

type Actor = { userId: string; ip?: string };

const PAGE_SIZE = 50;

const tenantSummaryInclude = {
  subscription: { include: { plan: true } },
  _count: {
    select: { staff: { where: { active: true } }, appointments: true },
  },
  tenantUsers: {
    where: { user: { userRoles: { some: { role: { name: "owner" } } } } },
    include: { user: { select: { email: true, fullName: true } } },
    take: 1,
  },
} satisfies Prisma.TenantInclude;

type TenantSummaryRow = Prisma.TenantGetPayload<{
  include: typeof tenantSummaryInclude;
}>;

function summarize(tenant: TenantSummaryRow) {
  const evaluation = evaluateSubscription(tenant.subscription);
  const owner = tenant.tenantUsers[0]?.user;
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    industry: tenant.industry,
    status: tenant.status,
    createdAt: tenant.createdAt.toISOString(),
    owner: owner ? { email: owner.email, fullName: owner.fullName } : null,
    plan: tenant.subscription?.plan.code ?? null,
    subscription: {
      status: tenant.subscription?.status ?? null,
      state: evaluation.state,
      access: evaluation.access,
      accessUntil: evaluation.accessUntil?.toISOString() ?? null,
    },
    activeStaff: tenant._count.staff,
    appointments: tenant._count.appointments,
  };
}

export async function listTenants(
  prisma: PrismaClient,
  query: { search?: string; page: number },
) {
  const where: Prisma.TenantWhereInput = query.search
    ? {
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { slug: { contains: query.search, mode: "insensitive" } },
          {
            tenantUsers: {
              some: {
                user: {
                  email: { contains: query.search, mode: "insensitive" },
                },
              },
            },
          },
        ],
      }
    : {};
  const [total, tenants] = await Promise.all([
    prisma.tenant.count({ where }),
    prisma.tenant.findMany({
      where,
      include: tenantSummaryInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return {
    total,
    page: query.page,
    pageSize: PAGE_SIZE,
    items: tenants.map(summarize),
  };
}

export async function getTenantDetail(prisma: PrismaClient, tenantId: string) {
  const tenant = await prisma.tenant
    .findUniqueOrThrow({
      where: { id: tenantId },
      include: tenantSummaryInclude,
    })
    .catch(notFoundIfMissing("Negocio no encontrado", "TENANT_NOT_FOUND"));
  const [payments, auditLog] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId },
      orderBy: { paidAt: "desc" },
      take: 24,
      include: { recordedBy: { select: { email: true } } },
    }),
    prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { email: true } } },
    }),
  ]);
  return {
    ...summarize(tenant),
    subscriptionDetail: tenant.subscription
      ? {
          trialEndsAt: tenant.subscription.trialEndsAt?.toISOString() ?? null,
          currentPeriodEnd:
            tenant.subscription.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: tenant.subscription.cancelAtPeriodEnd,
          planName: tenant.subscription.plan.name,
          planPriceCents: tenant.subscription.plan.priceCents,
        }
      : null,
    payments: payments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      method: payment.method,
      reference: payment.reference,
      paidAt: payment.paidAt.toISOString(),
      periodStart: payment.periodStart.toISOString(),
      periodEnd: payment.periodEnd.toISOString(),
      recordedBy: payment.recordedBy?.email ?? null,
    })),
    auditLog: auditLog.map((entry) => ({
      action: entry.action,
      actor: entry.actor?.email ?? null,
      metadata: entry.metadataJson,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

async function subscriptionOf(prisma: PrismaClient, tenantId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  if (!subscription) {
    throw notFound("El negocio no tiene suscripcion", "SUBSCRIPTION_NOT_FOUND");
  }
  return subscription;
}

/** Registra un pago recibido y extiende la suscripcion por los meses pagados. */
export async function recordPayment(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    amountCents: number;
    currency?: string;
    method: string;
    reference?: string;
    notes?: string;
    months: number;
    paidAt?: Date;
  },
  actor: Actor,
) {
  const subscription = await subscriptionOf(prisma, tenantId);
  const paidAt = input.paidAt ?? new Date();
  const period = nextBillingPeriod(subscription, input.months, paidAt);

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        tenantId,
        subscriptionId: subscription.id,
        amountCents: input.amountCents,
        currency: input.currency ?? subscription.plan.currency,
        method: input.method,
        reference: input.reference,
        notes: input.notes,
        paidAt,
        recordedById: actor.userId,
        ...period,
      },
    });
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "active",
        currentPeriodStart: period.periodStart,
        currentPeriodEnd: period.periodEnd,
        trialEndsAt: null,
        canceledAt: null,
        cancelAtPeriodEnd: false,
      },
    });
    await recordAudit(tx, {
      tenantId,
      actorUserId: actor.userId,
      action: "billing.payment_recorded",
      entityType: "Payment",
      entityId: payment.id,
      metadata: {
        amountCents: input.amountCents,
        months: input.months,
        method: input.method,
        periodEnd: period.periodEnd.toISOString(),
      },
      ip: actor.ip,
    });
    return payment;
  });
}

/** Cambia de plan, extiende la prueba o cancela la suscripcion de un negocio. */
export async function updateSubscription(
  prisma: PrismaClient,
  tenantId: string,
  input: { planCode?: string; trialEndsAt?: Date; cancel?: boolean },
  actor: Actor,
) {
  const subscription = await subscriptionOf(prisma, tenantId);
  const data: Prisma.SubscriptionUpdateInput = {};
  if (input.planCode) {
    const plan = await prisma.plan.findUnique({
      where: { code: input.planCode },
    });
    if (!plan || !plan.active) {
      throw badRequest("Plan no valido", "INVALID_PLAN");
    }
    data.plan = { connect: { id: plan.id } };
  }
  if (input.trialEndsAt) {
    if (subscription.status !== "trialing") {
      throw badRequest(
        "Solo se puede extender la prueba de un negocio en prueba",
        "NOT_TRIALING",
      );
    }
    data.trialEndsAt = input.trialEndsAt;
  }
  if (input.cancel) {
    data.status = "canceled";
    data.canceledAt = new Date();
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: subscription.id }, data });
    await recordAudit(tx, {
      tenantId,
      actorUserId: actor.userId,
      action: "billing.subscription_updated",
      entityType: "Subscription",
      entityId: subscription.id,
      metadata: {
        planCode: input.planCode,
        trialEndsAt: input.trialEndsAt?.toISOString(),
        cancel: input.cancel,
      },
      ip: actor.ip,
    });
  });
  return getTenantDetail(prisma, tenantId);
}

export async function setTenantStatus(
  prisma: PrismaClient,
  tenantId: string,
  input: { suspended: boolean; reason?: string },
  actor: Actor,
) {
  await prisma.tenant
    .update({
      where: { id: tenantId },
      data: { status: input.suspended ? "suspended" : "active" },
    })
    .catch(notFoundIfMissing("Negocio no encontrado", "TENANT_NOT_FOUND"));
  await recordAudit(prisma, {
    tenantId,
    actorUserId: actor.userId,
    action: input.suspended ? "tenant.suspended" : "tenant.reactivated",
    metadata: input.reason ? { reason: input.reason } : undefined,
    ip: actor.ip,
  });
  return getTenantDetail(prisma, tenantId);
}

export function listPlans(prisma: PrismaClient) {
  return prisma.plan.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
  });
}

export async function updatePlan(
  prisma: PrismaClient,
  code: string,
  input: {
    name?: string;
    priceCents?: number;
    maxStaff?: number;
    whatsappMessagesPerMonth?: number;
    features?: Record<string, { enabled: boolean }>;
    active?: boolean;
  },
  actor: Actor,
) {
  const { features, ...fields } = input;
  const plan = await prisma.plan
    .update({
      where: { code },
      data: { ...fields, ...(features ? { featuresJson: features } : {}) },
    })
    .catch(notFoundIfMissing("Plan no encontrado", "PLAN_NOT_FOUND"));
  await recordAudit(prisma, {
    actorUserId: actor.userId,
    action: "billing.plan_updated",
    entityType: "Plan",
    entityId: plan.id,
    metadata: { code, ...input },
    ip: actor.ip,
  });
  return plan;
}
