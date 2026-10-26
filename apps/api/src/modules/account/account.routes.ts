import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { okResponseSchema, passwordSchema } from "../../shared/schemas.js";
import { issueAdminToken } from "../auth/auth.service.js";
import { requireAuth } from "../auth/guards.js";
import {
  changePassword,
  requestPasswordReset,
  resetPassword,
  sendEmailVerification,
  verifyEmail,
} from "./account.service.js";

const tags = ["cuenta"];
const tokenBody = z.object({ token: z.string().min(20).max(200) });

export async function accountRoutes(app: FastifyInstance) {
  // Rutas publicas con enlaces por correo: limite estricto contra abuso.
  await app.register(async (publicAccount) => {
    await publicAccount.register(rateLimit, {
      max: 10,
      timeWindow: "15 minutes",
    });
    const routes = publicAccount.withTypeProvider<ZodTypeProvider>();

    routes.post(
      "/auth/password/forgot",
      {
        schema: {
          tags,
          summary: "Envia un enlace para restablecer la contrasena",
          body: z.object({ email: z.email() }),
          response: { 200: okResponseSchema },
        },
      },
      async (request) =>
        requestPasswordReset(app.prisma, request.body.email, request.ip),
    );

    routes.post(
      "/auth/password/reset",
      {
        schema: {
          tags,
          body: tokenBody.extend({ password: passwordSchema }),
          response: { 200: okResponseSchema },
        },
      },
      async (request) => resetPassword(app.prisma, request.body, request.ip),
    );

    routes.post(
      "/auth/email/verify",
      {
        schema: { tags, body: tokenBody, response: { 200: okResponseSchema } },
      },
      async (request) => verifyEmail(app.prisma, request.body.token),
    );
  });

  const routes = app.withTypeProvider<ZodTypeProvider>();
  const security = [{ bearerAuth: [] }];

  routes.post(
    "/auth/email/resend",
    {
      preHandler: [requireAuth],
      schema: { tags, security, response: { 200: okResponseSchema } },
    },
    async (request) => {
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: request.auth!.userId },
      });
      if (!user.emailVerifiedAt) {
        await sendEmailVerification(app.prisma, user);
      }
      return { ok: true as const };
    },
  );

  routes.post(
    "/auth/password/change",
    {
      preHandler: [requireAuth],
      schema: {
        tags,
        security,
        summary: "Cambia la contrasena y cierra las demas sesiones",
        body: z.object({
          currentPassword: z.string().min(1),
          newPassword: passwordSchema,
        }),
        response: { 200: z.object({ ok: z.literal(true), token: z.string() }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      await changePassword(
        app.prisma,
        { userId: auth.userId, tenantId: auth.tenantId, ...request.body },
        request.ip,
      );
      // Las sesiones anteriores quedan revocadas; esta recibe un token nuevo.
      return {
        ok: true as const,
        token: issueAdminToken(app.jwt, {
          userId: auth.userId,
          tenantId: auth.tenantId,
          email: auth.email,
        }),
      };
    },
  );
}
