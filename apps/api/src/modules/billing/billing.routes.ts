import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { scopeOf } from "../../shared/tenant-scope.js";
import { adminAccess } from "../auth/guards.js";
import { tenantOf } from "../tenancy/tenant-context.js";
import {
  getSubscriptionSummary,
  getUsage,
  listActivePlans,
} from "./billing.service.js";

const tags = ["facturacion"];
const security = [{ bearerAuth: [] }];

/**
 * Planes, suscripcion y consumo del negocio. Los cambios de plan y los pagos se registran
 * desde el panel de la plataforma (modulo platform); un negocio no puede asignarse un plan.
 */
export async function billingRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // Publico: lo usan la pagina de precios y el registro.
  routes.get("/plans", { schema: { tags } }, async () =>
    listActivePlans(app.prisma),
  );

  routes.get(
    "/subscription",
    { preHandler: adminAccess(), schema: { tags, security } },
    async (request) =>
      getSubscriptionSummary(scopeOf(request), await tenantOf(request)),
  );

  routes.get(
    "/billing/usage",
    { preHandler: adminAccess(), schema: { tags, security } },
    async (request) => getUsage(scopeOf(request), await tenantOf(request)),
  );
}
