import { env } from "../../config.js";
import type { TenantScope } from "../../shared/tenant-scope.js";
import type { TenantContext } from "../tenancy/tenant-context.js";

/** Direccion publica de reservas del negocio. */
export function bookingUrlFor(slug: string) {
  return new URL(
    slug,
    `${env.PUBLIC_BOOKING_BASE_URL.replace(/\/$/, "")}/`,
  ).toString();
}

/**
 * Pasos para dejar el negocio listo para recibir reservas. Se calculan a partir de los
 * datos reales, no de banderas que el usuario marque a mano.
 */
export async function getOnboardingChecklist(
  { db, tenantId }: TenantScope,
  tenant: TenantContext,
  user: { emailVerified: boolean },
) {
  const [services, staff, schedules, whatsapp, appointments] =
    await Promise.all([
      db.service.count({ where: { active: true } }),
      db.staff.count({ where: { active: true } }),
      db.staffSchedule.count(),
      db.integrationConnection.findUnique({
        where: {
          tenantId_provider_scopeKey: {
            tenantId,
            provider: "whatsapp",
            scopeKey: "tenant",
          },
        },
        select: { status: true },
      }),
      db.appointment.count(),
    ]);

  const steps = [
    { key: "verify_email", done: user.emailVerified },
    { key: "add_services", done: services > 0 },
    { key: "add_staff", done: staff > 0 },
    { key: "set_schedule", done: schedules > 0 },
    {
      key: "connect_whatsapp",
      done: whatsapp?.status === "connected",
      optional: true,
    },
    { key: "first_appointment", done: appointments > 0 },
  ];
  const required = steps.filter((step) => !step.optional);
  return {
    bookingUrl: bookingUrlFor(tenant.slug),
    completed: required.every((step) => step.done),
    progress: required.filter((step) => step.done).length / required.length,
    steps,
    subscription: {
      state: tenant.subscription.state,
      accessUntil: tenant.subscription.accessUntil?.toISOString() ?? null,
    },
  };
}
