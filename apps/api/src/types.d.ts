import type { PrismaClient } from "@citas/db";
import type { BookingCustomerTokenPayload } from "./modules/auth/tokens.js";
import type { TenantContext } from "./modules/tenancy/tenant-context.js";
import type { TenantScope } from "./shared/tenant-scope.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Usuario del panel autenticado (lo asigna requireAuth). */
    auth?: {
      userId: string;
      tenantId: string;
      email: string;
      roles: string[];
      permissions: string[];
    };
    /** Cliente del portal verificado por OTP (lo asigna requirePortalCustomer). */
    customerAuth?: BookingCustomerTokenPayload;
    /** Negocio del portal resuelto por slug. */
    portalTenant?: TenantContext;
    /** Acceso a datos filtrado por el negocio de la peticion. */
    scope?: TenantScope;
  }

  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export {};
