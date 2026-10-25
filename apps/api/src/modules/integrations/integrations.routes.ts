import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { env } from "../../config.js";
import { badRequest } from "../../shared/errors.js";
import { scopeOf } from "../../shared/tenant-scope.js";
import { adminAccess } from "../auth/guards.js";
import { PERMISSIONS } from "../auth/permissions.js";
import { completeGoogleOAuth, startGoogleOAuth } from "./google-calendar.js";
import * as integrations from "./integrations.service.js";

const tags = ["integraciones"];
const security = [{ bearerAuth: [] }];
const access = adminAccess(PERMISSIONS.settingsManage);

const scopeSchema = z.enum(["tenant", "staff"]).default("tenant");
const scopeBody = z
  .object({ scope: scopeSchema, staffId: z.uuid().optional() })
  .default({ scope: "tenant" });

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function htmlPage(title: string, message: string) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<body style="font-family: system-ui; padding: 32px;"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></body></html>`;
}

export async function integrationRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    "/integrations",
    { preHandler: access, schema: { tags, security } },
    async (request) => integrations.listIntegrations(scopeOf(request)),
  );

  routes.get(
    "/integrations/whatsapp/setup",
    { preHandler: access, schema: { tags, security } },
    async (request) => integrations.getWhatsappSetup(scopeOf(request)),
  );

  routes.post(
    "/integrations/whatsapp/evolution/connect",
    {
      preHandler: access,
      schema: {
        tags,
        security,
        summary: "Conecta una instancia de Evolution API (WhatsApp Cloud API)",
        body: z.object({
          baseUrl: z.url(),
          apiKey: z.string().min(8),
          instanceName: z.string().trim().min(1).max(100),
          webhookSecret: z.string().min(16).optional(),
        }),
      },
    },
    async (request) =>
      integrations.connectEvolution(scopeOf(request), request.body),
  );

  routes.post(
    "/integrations/chatwoot/connect",
    {
      preHandler: access,
      schema: {
        tags,
        security,
        body: z.object({
          baseUrl: z.url(),
          apiToken: z.string().min(8),
          accountId: z.coerce.number().int().positive(),
          inboxId: z.coerce.number().int().positive(),
          webhookSecret: z.string().min(16).optional(),
        }),
      },
    },
    async (request) =>
      integrations.connectChatwoot(scopeOf(request), request.body),
  );

  routes.post(
    "/integrations/google/start",
    {
      preHandler: access,
      schema: {
        tags,
        security,
        body: z
          .object({ scope: scopeSchema, staffId: z.uuid().optional() })
          .refine(
            (body) => body.scope !== "staff" || body.staffId,
            "staffId es requerido para integraciones por profesional",
          ),
      },
    },
    async (request) =>
      startGoogleOAuth(scopeOf(request), app.jwt, {
        ...request.body,
        scopeKey: integrations.scopeKeyFor(
          request.body.scope,
          request.body.staffId,
        ),
      }),
  );

  routes.get(
    "/integrations/google/callback",
    {
      schema: {
        tags,
        querystring: z.object({
          code: z.string().min(1).optional(),
          state: z.string().min(1).optional(),
          error: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { code, state, error } = request.query;
      reply.type("text/html");
      if (error) {
        return htmlPage(
          "Conexion rechazada",
          `Google rechazo la conexion: ${error}`,
        );
      }
      if (!code || !state) {
        throw badRequest("Faltan code/state de Google OAuth");
      }
      await completeGoogleOAuth(app.prisma, app.jwt, { code, state });
      return htmlPage(
        "Google Calendar conectado",
        `Ya puedes cerrar esta ventana y volver a ${env.PRODUCT_NAME}.`,
      );
    },
  );

  routes.post(
    "/integrations/:provider/config",
    {
      preHandler: access,
      schema: {
        tags,
        security,
        summary: "Guarda estado y metadatos de email o Google Calendar",
        params: z.object({ provider: z.enum(["email", "google_calendar"]) }),
        body: z.object({
          scope: scopeSchema,
          staffId: z.uuid().optional(),
          status: z
            .enum(["disconnected", "pending", "connected", "error"])
            .default("connected"),
          accountEmail: z.email().optional(),
          externalId: z.string().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
      },
    },
    async (request) =>
      integrations.saveIntegrationMetadata(
        scopeOf(request),
        request.params.provider,
        request.body,
      ),
  );

  routes.post(
    "/integrations/:provider/disconnect",
    {
      preHandler: access,
      schema: {
        tags,
        security,
        params: z.object({
          provider: z.enum([
            "google_calendar",
            "whatsapp",
            "email",
            "chatwoot",
          ]),
        }),
        body: scopeBody,
      },
    },
    async (request) =>
      integrations.disconnectIntegration(
        scopeOf(request),
        request.params.provider,
        request.body,
      ),
  );
}
