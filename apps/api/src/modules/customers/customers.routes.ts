import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { idParamsSchema } from "../../shared/schemas.js";
import { scopeOf } from "../../shared/tenant-scope.js";
import { adminAccess } from "../auth/guards.js";
import { PERMISSIONS } from "../auth/permissions.js";
import { customerInputSchema } from "./customers.schemas.js";
import * as customers from "./customers.service.js";

const tags = ["clientes"];
const security = [{ bearerAuth: [] }];

export async function customerRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    "/customers",
    {
      preHandler: adminAccess(),
      schema: {
        tags,
        security,
        querystring: z.object({ search: z.string().trim().optional() }),
      },
    },
    async (request) =>
      customers.searchCustomers(scopeOf(request), request.query.search),
  );

  routes.post(
    "/customers",
    {
      preHandler: adminAccess(PERMISSIONS.customersManage),
      schema: { tags, security, body: customerInputSchema },
    },
    async (request) => customers.createCustomer(scopeOf(request), request.body),
  );

  routes.patch(
    "/customers/:id",
    {
      preHandler: adminAccess(PERMISSIONS.customersManage),
      schema: {
        tags,
        security,
        params: idParamsSchema,
        body: customerInputSchema.partial(),
      },
    },
    async (request) =>
      customers.updateCustomer(
        scopeOf(request),
        request.params.id,
        request.body,
      ),
  );
}
