import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { createPrismaClient, type PrismaClient } from "@citas/db";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { randomUUID } from "node:crypto";
import {
  apiDocsEnabled,
  corsOrigins,
  env,
  isProduction,
  trustProxy,
} from "./config.js";
import { accountRoutes } from "./modules/account/account.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { billingRoutes } from "./modules/billing/billing.routes.js";
import { catalogRoutes } from "./modules/catalog/catalog.routes.js";
import { customerRoutes } from "./modules/customers/customers.routes.js";
import { integrationRoutes } from "./modules/integrations/integrations.routes.js";
import { conversationRoutes } from "./modules/messaging/conversations.routes.js";
import { webhookRoutes } from "./modules/messaging/webhooks.routes.js";
import { templateRoutes } from "./modules/notifications/templates.routes.js";
import { onboardingRoutes } from "./modules/onboarding/onboarding.routes.js";
import { platformRoutes } from "./modules/platform/platform.routes.js";
import { portalRoutes } from "./modules/portal/portal.routes.js";
import { reportRoutes } from "./modules/reports/reports.routes.js";
import { appointmentRoutes } from "./modules/scheduling/appointments.routes.js";
import { teamRoutes } from "./modules/team/team.routes.js";
import { tenancyRoutes } from "./modules/tenancy/tenancy.routes.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { closeRateLimitStore } from "./shared/rate-limit.js";
import { registerOpenApi } from "./plugins/openapi.js";

const READY_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Sin respuesta en ${ms} ms`)),
        ms,
      ).unref(),
    ),
  ]);
}

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
    trustProxy,
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
    await closeRateLimitStore();
  });

  await app.register(cors, {
    origin: corsOrigins,
    // Las sesiones del navegador viajan en cookies httpOnly (ver shared/session.ts).
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  });
  await app.register(cookie);
  await app.register(jwt, { secret: env.JWT_SECRET });
  if (apiDocsEnabled) {
    await registerOpenApi(app);
  }
  registerErrorHandler(app);

  // Vivo: el proceso responde (lo usa Docker para reiniciarlo si se cuelga).
  app.get("/health", { schema: { hide: true } }, async () => ({
    ok: true,
    version: env.APP_VERSION,
    timestamp: new Date().toISOString(),
  }));

  // Listo: ademas llega a la base de datos (lo usan el proxy y el monitor de uptime).
  app.get("/ready", { schema: { hide: true } }, async (_request, reply) => {
    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, READY_TIMEOUT_MS);
      return { ok: true, version: env.APP_VERSION };
    } catch (error) {
      app.log.error({ err: error }, "La base de datos no responde");
      return reply
        .status(503)
        .send({ ok: false, error: "DATABASE_UNAVAILABLE" });
    }
  });

  for (const routes of [
    authRoutes,
    accountRoutes,
    onboardingRoutes,
    tenancyRoutes,
    teamRoutes,
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
    platformRoutes,
  ]) {
    await app.register(routes);
  }

  return app;
}
