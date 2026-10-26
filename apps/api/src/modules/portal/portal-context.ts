import type { FastifyRequest } from "fastify";
import { forbidden, notFound, unauthorized } from "../../shared/errors.js";
import { tenantScope } from "../../shared/tenant-scope.js";
import {
  BOOKING_CUSTOMER_TOKEN_TYPE,
  type BookingCustomerTokenPayload,
} from "../auth/tokens.js";
import { findTenantContextBySlug } from "../tenancy/tenant-context.js";

/** Resuelve el negocio del portal a partir de `:tenantSlug` y deja su scope en la peticion. */
export async function resolvePortalTenant(request: FastifyRequest) {
  const { tenantSlug } = request.params as { tenantSlug?: string };
  const tenant = await findTenantContextBySlug(
    request.server.prisma,
    String(tenantSlug ?? ""),
  );
  if (tenant.suspended) {
    throw notFound("Negocio no encontrado", "TENANT_NOT_FOUND");
  }
  request.tenant = tenant;
  request.scope = tenantScope(request.server.prisma, tenant.id);
}

/** Las reservas en linea se cierran si la prueba o la suscripcion del negocio vencieron. */
export async function requireBookingOpen(request: FastifyRequest) {
  if (request.tenant?.access !== "full") {
    throw forbidden(
      "Este negocio no esta recibiendo reservas en linea en este momento.",
      "BOOKING_UNAVAILABLE",
    );
  }
}

/** Exige un token de cliente verificado por OTP y emitido para este mismo negocio. */
export async function requirePortalCustomer(request: FastifyRequest) {
  let payload: Partial<BookingCustomerTokenPayload>;
  try {
    payload = await request.jwtVerify<BookingCustomerTokenPayload>();
  } catch {
    throw unauthorized(
      "Necesitas verificar tu telefono para continuar",
      "BOOKING_AUTH_REQUIRED",
    );
  }
  if (
    payload.type !== BOOKING_CUSTOMER_TOKEN_TYPE ||
    !payload.customerId ||
    payload.tenantId !== request.tenant?.id
  ) {
    throw unauthorized(
      "Necesitas verificar tu telefono para continuar",
      "BOOKING_AUTH_REQUIRED",
    );
  }
  request.customerAuth = payload as BookingCustomerTokenPayload;
}
