import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { corsOrigins, env } from "./config.js";
import { HttpError } from "./lib/http-error.js";
import { authRoutes } from "./routes/auth.js";
import { tenantRoutes } from "./routes/tenants.js";
import { staffRoutes } from "./routes/staff.js";
import { serviceRoutes } from "./routes/services.js";
import { customerRoutes } from "./routes/customers.js";
import { appointmentRoutes } from "./routes/appointments.js";
import { publicBookingRoutes } from "./routes/public-booking.js";
import { publicAuthRoutes } from "./routes/public-auth.js";
import { notificationRoutes } from "./routes/notifications.js";
import { planRoutes } from "./routes/plans.js";
import { reportRoutes } from "./routes/reports.js";
import { integrationRoutes } from "./routes/integrations.js";
import { scheduledReportRoutes } from "./routes/scheduled-reports.js";
import { whatsappWebhookRoutes } from "./routes/whatsapp-webhooks.js";
import { chatwootWebhookRoutes } from "./routes/chatwoot-webhooks.js";
import { messagingRoutes } from "./routes/messaging.js";

const prisma = new PrismaClient();

function redactSensitiveQuery(url: string) {
  return url.replace(
    /([?&](?:token|apikey|api_key|access_token)=)[^&]*/gi,
    "$1[REDACTED]",
  );
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: redactSensitiveQuery(request.url),
            host: request.headers.host,
            remoteAddress: request.ip,
            remotePort: request.socket.remotePort,
          };
        },
      },
    },
  });

  app.decorate("prisma", prisma);

  await app.register(cors, {
    origin: corsOrigins,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  app.addHook("onRequest", async (request) => {
    const correlationId = request.headers["x-correlation-id"] ?? randomUUID();
    request.headers["x-correlation-id"] = String(correlationId);
  });

  app.get("/health", async () => ({
    ok: true,
    timestamp: new Date().toISOString(),
  }));

  await authRoutes(app);
  await tenantRoutes(app);
  await staffRoutes(app);
  await serviceRoutes(app);
  await customerRoutes(app);
  await appointmentRoutes(app);
  await publicAuthRoutes(app);
  await publicBookingRoutes(app);
  await notificationRoutes(app);
  await planRoutes(app);
  await reportRoutes(app);
  await integrationRoutes(app);
  await scheduledReportRoutes(app);
  await whatsappWebhookRoutes(app);
  await chatwootWebhookRoutes(app);
  await messagingRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }

    if (typeof (error as { statusCode?: number }).statusCode === "number") {
      const statusCode = (error as { statusCode: number }).statusCode;
      if (statusCode >= 400 && statusCode < 500) {
        return reply.status(statusCode).send({
          error: (error as { code?: string }).code ?? "REQUEST_ERROR",
          message: (error as { message?: string }).message ?? "Request error",
        });
      }
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Datos invalidos",
        detail: error.issues,
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "Error interno",
    });
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
