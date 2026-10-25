import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { createPrismaClient, type PrismaClient } from "@citas/db";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { randomUUID } from "node:crypto";
import { apiDocsEnabled, corsOrigins, env, isProduction } from "./config.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { billingRoutes } from "./modules/billing/billing.routes.js";
import { catalogRoutes } from "./modules/catalog/catalog.routes.js";
import { customerRoutes } from "./modules/customers/customers.routes.js";
import { integrationRoutes } from "./modules/integrations/integrations.routes.js";
import { conversationRoutes } from "./modules/messaging/conversations.routes.js";
import { webhookRoutes } from "./modules/messaging/webhooks.routes.js";
import { templateRoutes } from "./modules/notifications/templates.routes.js";
import { portalRoutes } from "./modules/portal/portal.routes.js";
import { reportRoutes } from "./modules/reports/reports.routes.js";
import { appointmentRoutes } from "./modules/scheduling/appointments.routes.js";
import { tenancyRoutes } from "./modules/tenancy/tenancy.routes.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerOpenApi } from "./plugins/openapi.js";

const SENSITIVE_QUERY = /([?&](?:token|apikey|api_key|access_token)=)[^&]*/gi;

export type BuildAppOptions = {
  /** Permite inyectar un cliente (tests); por defecto se crea uno con DATABASE_URL. */
  prisma?: PrismaClient;
};

/** Raiz de composicion: plugins transversales y modulos de la API. */
export async function buildApp(options: BuildAppOptions = {}) {
  const prisma =
    options.prisma ??
    createPrismaClient({ connectionString: env.DATABASE_URL });

  const app = Fastify({
    genReqId: (request) =>
      String(request.headers["x-correlation-id"] ?? randomUUID()),
    logger: {
      level: isProduction ? "info" : "debug",
      redact: ["req.headers.authorization", "req.headers.apikey"],
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url.replace(SENSITIVE_QUERY, "$1[REDACTED]"),
            remoteAddress: request.ip,
          };
        },
      },
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("prisma", prisma);
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-correlation-id", request.id);
  });
  app.addHook("onClose", async () => {
    if (!options.prisma) {
      await prisma.$disconnect();
    }
  });

  await app.register(cors, { origin: corsOrigins });
  await app.register(jwt, { secret: env.JWT_SECRET });
  if (apiDocsEnabled) {
    await registerOpenApi(app);
  }
  registerErrorHandler(app);

  app.get("/health", { schema: { hide: true } }, async () => ({
    ok: true,
    timestamp: new Date().toISOString(),
  }));

  for (const routes of [
    authRoutes,
    tenancyRoutes,
    catalogRoutes,
    customerRoutes,
    appointmentRoutes,
    portalRoutes,
    templateRoutes,
    billingRoutes,
    reportRoutes,
    integrationRoutes,
    conversationRoutes,
    webhookRoutes,
  ]) {
    await app.register(routes);
  }

  return app;
}
