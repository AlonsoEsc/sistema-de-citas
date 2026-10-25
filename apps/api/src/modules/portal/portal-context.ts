import type { FastifyRequest } from "fastify";
import { unauthorized } from "../../shared/errors.js";
import { tenantScope } from "../../shared/tenant-scope.js";
import {
  BOOKING_CUSTOMER_TOKEN_TYPE,
  type BookingCustomerTokenPayload,
} from "../auth/tokens.js";
import {
  findTenantContextBySlug,
  type TenantContext,
} from "../tenancy/tenant-context.js";

/** Resuelve el negocio del portal a partir de `:tenantSlug` y deja su scope en la peticion. */
export async function resolvePortalTenant(request: FastifyRequest) {
  const { tenantSlug } = request.params as { tenantSlug?: string };
  const tenant = await findTenantContextBySlug(
    request.server.prisma,
    String(tenantSlug ?? ""),
  );
  request.portalTenant = tenant;
  request.scope = tenantScope(request.server.prisma, tenant.id);
}

export function portalTenantOf(request: FastifyRequest): TenantContext {
  if (!request.portalTenant) {
    throw unauthorized();
  }
  return request.portalTenant;
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
    payload.tenantId !== request.portalTenant?.id
  ) {
    throw unauthorized(
      "Necesitas verificar tu telefono para continuar",
      "BOOKING_AUTH_REQUIRED",
    );
  }
  request.customerAuth = payload as BookingCustomerTokenPayload;
}
