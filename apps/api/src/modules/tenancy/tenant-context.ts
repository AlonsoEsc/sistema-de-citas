import type { PrismaClient, TenantDb } from "@citas/db";
import { notFound } from "../../shared/errors.js";

const DEFAULT_CANCEL_POLICY_MINUTES = 120;
const DEFAULT_BOOKING_WINDOW_DAYS = 30;

/** Datos del negocio que necesitan las reglas de agenda y los mensajes. */
export type TenantContext = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  cancelPolicyMinutes: number;
  bookingWindowDays: number;
};

type TenantWithSettings = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  settings: { cancelPolicyMinutes: number; bookingWindowDays: number } | null;
};

export function toTenantContext(tenant: TenantWithSettings): TenantContext {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    timezone: tenant.timezone,
    currency: tenant.currency,
    cancelPolicyMinutes:
      tenant.settings?.cancelPolicyMinutes ?? DEFAULT_CANCEL_POLICY_MINUTES,
    bookingWindowDays:
      tenant.settings?.bookingWindowDays ?? DEFAULT_BOOKING_WINDOW_DAYS,
  };
}

export async function loadTenantContext(
  db: TenantDb | PrismaClient,
  tenantId: string,
): Promise<TenantContext> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: { settings: true },
  });
  if (!tenant) {
    throw notFound("Negocio no encontrado", "TENANT_NOT_FOUND");
  }
  return toTenantContext(tenant);
}

export async function findTenantContextBySlug(
  prisma: PrismaClient,
  slug: string,
): Promise<TenantContext> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    include: { settings: true },
  });
  if (!tenant) {
    throw notFound("Negocio no encontrado", "TENANT_NOT_FOUND");
  }
  return toTenantContext(tenant);
}
