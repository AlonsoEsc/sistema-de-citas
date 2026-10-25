import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PERMISSIONS, requireAuth, requirePermission } from "../lib/auth.js";
import { notFound } from "../lib/http-error.js";

const customerSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  notes: z.string().max(1000).optional(),
});

export async function customerRoutes(app: FastifyInstance) {
  app.get("/customers", { preHandler: [requireAuth] }, async (request) => {
    const query = z
      .object({ search: z.string().optional() })
      .parse(request.query);

    return app.prisma.customer.findMany({
      where: {
        tenantId: request.tenantId,
        ...(query.search
          ? {
              OR: [
                { fullName: { contains: query.search, mode: "insensitive" } },
                { phone: { contains: query.search } },
                { email: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  app.post(
    "/customers",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.customersManage)],
    },
    async (request) => {
      const payload = customerSchema.parse(request.body);
      return app.prisma.customer.create({
        data: {
          tenantId: request.tenantId as string,
          fullName: payload.fullName,
          phone: payload.phone,
          email: payload.email,
          notes: payload.notes,
        },
      });
    },
  );

  app.patch(
    "/customers/:id",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.customersManage)],
    },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const payload = customerSchema.partial().parse(request.body);

      const existing = await app.prisma.customer.findFirst({
        where: { id: params.id, tenantId: request.tenantId },
      });
      if (!existing) {
        throw notFound("Cliente no encontrado");
      }

      return app.prisma.customer.update({
        where: { id: existing.id },
        data: payload,
      });
    },
  );
}
