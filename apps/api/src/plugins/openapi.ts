import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import { env } from "../config.js";

/** Genera el documento OpenAPI desde los esquemas Zod de las rutas y lo publica en /docs. */
export async function registerOpenApi(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: `${env.PRODUCT_NAME} API`,
        version: "1.0.0",
        description:
          "API multi-tenant de reservas. Las rutas de administracion usan un token Bearer de tipo admin; las del portal, un token de cliente verificado por OTP.",
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
}
