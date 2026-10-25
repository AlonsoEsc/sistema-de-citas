import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { scopeOf } from "../../shared/tenant-scope.js";
import { adminAccess } from "../auth/guards.js";

const tags = ["facturacion"];
const security = [{ bearerAuth: [] }];

/**
 * Planes y suscripcion del negocio (solo lectura). Los cambios de plan se haran desde el
 * flujo de cobro (fase 2); un negocio no puede asignarse un plan por su cuenta.
 */
export async function billingRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    "/plans",
    { preHandler: adminAccess(), schema: { tags, security } },
    async () => app.prisma.plan.findMany({ orderBy: { priceCents: "asc" } }),
  );

  routes.get(
    "/subscription",
    { preHandler: adminAccess(), schema: { tags, security } },
    async (request) =>
      (await scopeOf(request).db.tenantSubscription.findFirst({
        where: { status: "active" },
        include: { plan: true },
      })) ?? null,
  );
}
