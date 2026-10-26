import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { badRequest } from "../../shared/errors.js";
import { toJsonValue } from "../../shared/json.js";
import { notFoundIfMissing } from "../../shared/prisma-errors.js";
import { idParamsSchema } from "../../shared/schemas.js";
import { scopeOf } from "../../shared/tenant-scope.js";
import { adminAccess } from "../auth/guards.js";
import { PERMISSIONS } from "../auth/permissions.js";

const tags = ["notificaciones"];
const security = [{ bearerAuth: [] }];
const access = adminAccess(PERMISSIONS.settingsManage);
const templateNotFound = notFoundIfMissing(
  "Plantilla no encontrada",
  "TEMPLATE_NOT_FOUND",
);

const OTP_EVENT = "auth.otp.requested";

export async function templateRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    "/notifications/templates",
    { preHandler: access, schema: { tags, security } },
    async (request) =>
      scopeOf(request).db.notificationTemplate.findMany({
        orderBy: [{ channel: "asc" }, { eventType: "asc" }],
      }),
  );

  routes.put(
    "/notifications/templates/:id",
    {
      preHandler: access,
      schema: {
        tags,
        security,
        params: idParamsSchema,
        body: z.object({
          subject: z.string().optional(),
          body: z.string().min(3),
        }),
      },
    },
    async (request) =>
      scopeOf(request)
        .db.notificationTemplate.update({
          where: { id: request.params.id },
          data: request.body,
        })
        .catch(templateNotFound),
  );

  // Activa o desactiva un aviso. El codigo de acceso del portal no se puede apagar:
  // sin el, los clientes no podrian entrar a reservar.
  routes.patch(
    "/notifications/templates/:id",
    {
      preHandler: access,
      schema: {
        tags,
        security,
        params: idParamsSchema,
        body: z.object({ enabled: z.boolean() }),
      },
    },
    async (request) => {
      const { db } = scopeOf(request);
      const template = await db.notificationTemplate
        .findUniqueOrThrow({ where: { id: request.params.id } })
        .catch(templateNotFound);
      if (!request.body.enabled && template.eventType === OTP_EVENT) {
        throw badRequest(
          "El código de acceso del portal no se puede desactivar",
          "TEMPLATE_REQUIRED",
        );
      }
      return db.notificationTemplate.update({
        where: { id: template.id },
        data: { enabled: request.body.enabled },
      });
    },
  );

  // Asocia una plantilla de WhatsApp aprobada por Meta (enviada via Evolution).
  routes.put(
    "/notifications/templates/:id/provider",
    {
      preHandler: access,
      schema: {
        tags,
        security,
        params: idParamsSchema,
        body: z.object({
          evolution: z.object({
            name: z.string().trim().min(1),
            language: z.string().trim().min(2).default("es"),
            parameterOrder: z.array(z.string().trim().min(1)).default([]),
            kind: z.enum(["standard", "authentication"]).default("standard"),
          }),
        }),
      },
    },
    async (request) =>
      scopeOf(request)
        .db.notificationTemplate.update({
          where: { id: request.params.id, channel: "whatsapp" },
          data: { variablesJson: toJsonValue(request.body) },
        })
        .catch(templateNotFound),
  );
}
