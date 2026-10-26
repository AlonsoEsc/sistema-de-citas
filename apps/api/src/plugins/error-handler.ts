import { CrossTenantWriteError, Prisma } from "@citas/db";
import type { FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { HttpError } from "../shared/errors.js";
import {
  isRetryableTransactionError,
  postgresErrorCode,
} from "../shared/prisma-errors.js";

const POSTGRES_EXCLUSION_VIOLATION = "23P01";

type ErrorBody = { error: string; message: string; detail?: unknown };

/** Traduce errores conocidos a respuestas HTTP consistentes: { error, message, detail? }. */
function toHttpResponse(
  error: unknown,
): { status: number; body: ErrorBody } | undefined {
  if (hasZodFastifySchemaValidationErrors(error)) {
    return {
      status: 400,
      body: {
        error: "VALIDATION_ERROR",
        message: "Datos invalidos",
        detail: error.validation.map((issue) => ({
          path: issue.instancePath,
          message: issue.message,
        })),
      },
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: "VALIDATION_ERROR",
        message: "Datos invalidos",
        detail: error.issues,
      },
    };
  }
  if (error instanceof HttpError) {
    return {
      status: error.statusCode,
      body: { error: error.code, message: error.message },
    };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (postgresErrorCode(error) === POSTGRES_EXCLUSION_VIOLATION) {
      return {
        status: 409,
        body: {
          error: "SCHEDULE_CONFLICT",
          message: "El profesional ya tiene una cita en ese horario",
        },
      };
    }
    // Si una transaccion agoto sus reintentos por concurrencia, el cliente puede repetir.
    if (isRetryableTransactionError(error)) {
      return {
        status: 409,
        body: {
          error: "CONCURRENT_UPDATE",
          message:
            "Otra operacion modifico estos datos al mismo tiempo. Intenta de nuevo.",
        },
      };
    }
    if (error.code === "P2002") {
      return {
        status: 409,
        body: { error: "DUPLICATE", message: "El registro ya existe" },
      };
    }
    if (error.code === "P2025") {
      return {
        status: 404,
        body: { error: "NOT_FOUND", message: "No encontrado" },
      };
    }
  }
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (
    !(error instanceof CrossTenantWriteError) &&
    !isResponseSerializationError(error) &&
    typeof statusCode === "number" &&
    statusCode >= 400 &&
    statusCode < 500
  ) {
    const { code, message } = error as { code?: string; message?: string };
    return {
      status: statusCode,
      body: {
        error: code ?? "REQUEST_ERROR",
        message: message ?? "Solicitud invalida",
      },
    };
  }
  return undefined;
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const response = toHttpResponse(error);
    if (response) {
      return reply.status(response.status).send(response.body);
    }
    request.log.error({ err: error }, "Error no controlado");
    return reply
      .status(500)
      .send({ error: "INTERNAL_SERVER_ERROR", message: "Error interno" });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply
      .status(404)
      .send({ error: "NOT_FOUND", message: "Ruta no encontrada" }),
  );
}
