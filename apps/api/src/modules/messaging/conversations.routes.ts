import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { scopeOf } from "../../shared/tenant-scope.js";
import { adminAccess } from "../auth/guards.js";
import { PERMISSIONS } from "../auth/permissions.js";
import { listConversations } from "./conversations.service.js";

export async function conversationRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/messaging/conversations",
    {
      preHandler: adminAccess(PERMISSIONS.appointmentsManage),
      schema: {
        tags: ["mensajeria"],
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          limit: z.coerce.number().int().min(50).max(1000).default(500),
        }),
      },
    },
    async (request) =>
      listConversations(scopeOf(request), { limit: request.query.limit }),
  );
}
