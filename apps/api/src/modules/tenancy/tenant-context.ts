import type { Prisma, PrismaClient, TenantDb } from "@citas/db";
import type { FastifyRequest } from "fastify";
import type { IndustryCode } from "@citas/shared/industries";
import { notFound } from "../../shared/errors.js";
import { scopeOf } from "../../shared/tenant-scope.js";
import {
  evaluateSubscription,
  type AccountAccess,
  type SubscriptionEvaluation,
} from "../billing/subscription-status.js";
import { mergeEntitlements, type EntitlementMap } from "./entitlements.js";

const DEFAULT_CANCEL_POLICY_MINUTES = 120;
const DEFAULT_BOOKING_WINDOW_DAYS = 30;

/** Datos del negocio que necesitan las reglas de agenda, facturacion y mensajes. */
export type TenantContext = {
  id: string;
  name: string;
  slug: string;
  industry: IndustryCode;
  timezone: string;
  currency: string;
  locale: string;
  cancelPolicyMinutes: number;
  bookingWindowDays: number;
  suspended: boolean;
  subscription: SubscriptionEvaluation & { planCode: string | null };
  /** Acceso efectivo: suspendido por la plataforma equivale a solo lectura. */
  access: AccountAccess;
  entitlements: EntitlementMap;
  limits: { maxStaff: number; whatsappMessagesPerMonth: number };
};

const contextInclude = {
  settings: true,
  subscription: { include: { plan: true } },
  entitlements: true,
} satisfies Prisma.TenantInclude;

type TenantWithContext = Prisma.TenantGetPayload<{
  include: typeof contextInclude;
}>;

export function toTenantContext(
  tenant: TenantWithContext,
  now = new Date(),
): TenantContext {
  const subscription = evaluateSubscription(tenant.subscription, now);
  const plan = tenant.subscription?.plan;
  const suspended = tenant.status === "suspended";
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    industry: tenant.industry,
    timezone: tenant.timezone,
    currency: tenant.currency,
    locale: tenant.locale,
    cancelPolicyMinutes:
      tenant.settings?.cancelPolicyMinutes ?? DEFAULT_CANCEL_POLICY_MINUTES,
    bookingWindowDays:
      tenant.settings?.bookingWindowDays ?? DEFAULT_BOOKING_WINDOW_DAYS,
    suspended,
    subscription: { ...subscription, planCode: plan?.code ?? null },
    access: suspended ? "read_only" : subscription.access,
    entitlements: mergeEntitlements(plan?.featuresJson, tenant.entitlements),
    limits: {
      maxStaff: plan?.maxStaff ?? 0,
      whatsappMessagesPerMonth: plan?.whatsappMessagesPerMonth ?? 0,
    },
  };
}

export async function loadTenantContext(
  db: TenantDb | PrismaClient,
  tenantId: string,
): Promise<TenantContext> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: contextInclude,
  });
  if (!tenant) {
    throw notFound("Negocio no encontrado", "TENANT_NOT_FOUND");
  }
  return toTenantContext(tenant);
}

/** Contexto del negocio de la peticion, cargado una sola vez. */
export async function tenantOf(request: FastifyRequest) {
  if (!request.tenant) {
    const { db, tenantId } = scopeOf(request);
    request.tenant = await loadTenantContext(db, tenantId);
  }
  return request.tenant;
}

export async function findTenantContextBySlug(
  prisma: PrismaClient,
  slug: string,
): Promise<TenantContext> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    include: contextInclude,
  });
  if (!tenant) {
    throw notFound("Negocio no encontrado", "TENANT_NOT_FOUND");
  }
  return toTenantContext(tenant);
}
