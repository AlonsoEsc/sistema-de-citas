import type { FastifyInstance } from "fastify";
import { OAuth2Client } from "google-auth-library";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import {
  badRequest,
  notFound,
  tooManyRequests,
  unauthorized,
} from "../lib/http-error.js";

const startSchema = z.object({
  provider: z.enum(["manual", "google", "facebook"]).default("manual"),
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(7),
  googleIdToken: z.string().optional(),
  facebookAccessToken: z.string().optional(),
});

const verifySchema = z.object({
  sessionId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

const MAX_VERIFY_ATTEMPTS = 5;
const OTP_REQUESTS_PER_PHONE = 3;
const OTP_REQUEST_WINDOW_MINUTES = 15;

const googleClient = env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(env.GOOGLE_CLIENT_ID)
  : null;

function normalizePhone(phone: string): string {
  const clean = phone.replace(/[^\d+]/g, "");
  if (!clean) {
    throw badRequest("Telefono invalido");
  }
  return clean.startsWith("+") ? clean : `+${clean}`;
}

function randomOtpCode() {
  return String(randomInt(100000, 1_000_000));
}

function maskPhone(phone: string) {
  const visible = phone.slice(-3);
  return `${"*".repeat(Math.max(0, phone.length - 3))}${visible}`;
}

async function resolveGoogleProfile(idToken: string) {
  if (!googleClient) {
    throw badRequest(
      "Google login no esta configurado en backend",
      "GOOGLE_NOT_CONFIGURED",
    );
  }
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload?.name) {
    throw badRequest(
      "No se pudo validar cuenta Google",
      "GOOGLE_PROFILE_INVALID",
    );
  }
  return {
    providerUserId: payload.sub,
    fullName: payload.name,
    email: payload.email ?? undefined,
  };
}

async function resolveFacebookProfile(accessToken: string) {
  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET) {
    throw badRequest(
      "Facebook login no esta configurado en backend",
      "FACEBOOK_NOT_CONFIGURED",
    );
  }

  const appToken = `${env.FACEBOOK_APP_ID}|${env.FACEBOOK_APP_SECRET}`;
  const debugUrl = new URL("https://graph.facebook.com/debug_token");
  debugUrl.searchParams.set("input_token", accessToken);
  debugUrl.searchParams.set("access_token", appToken);

  const debugResponse = await fetch(debugUrl);
  if (!debugResponse.ok) {
    throw badRequest(
      "No se pudo validar token de Facebook",
      "FACEBOOK_TOKEN_INVALID",
    );
  }
  const debugJson = (await debugResponse.json()) as {
    data?: { app_id?: string; user_id?: string; is_valid?: boolean };
  };
  if (
    !debugJson.data?.is_valid ||
    debugJson.data.app_id !== env.FACEBOOK_APP_ID
  ) {
    throw badRequest(
      "Token de Facebook invalido o expirado",
      "FACEBOOK_TOKEN_INVALID",
    );
  }

  const meUrl = new URL("https://graph.facebook.com/me");
  meUrl.searchParams.set("fields", "id,name,email");
  meUrl.searchParams.set("access_token", accessToken);
  const meResponse = await fetch(meUrl);
  if (!meResponse.ok) {
    throw badRequest(
      "No se pudo obtener perfil de Facebook",
      "FACEBOOK_PROFILE_INVALID",
    );
  }
  const me = (await meResponse.json()) as {
    id?: string;
    name?: string;
    email?: string;
  };
  if (!me.id || !me.name) {
    throw badRequest(
      "Perfil de Facebook incompleto",
      "FACEBOOK_PROFILE_INVALID",
    );
  }

  return {
    providerUserId: me.id,
    fullName: me.name,
    email: me.email,
  };
}

export async function publicAuthRoutes(app: FastifyInstance) {
  app.register(async (authApp) => {
    await authApp.register(import("@fastify/rate-limit"), {
      max: 20,
      timeWindow: "15 minutes",
    });

    authApp.post(
      "/public/:tenantSlug/auth/start",
      { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
      async (request) => {
        const params = z
          .object({ tenantSlug: z.string() })
          .parse(request.params);
        const payload = startSchema.parse(request.body);

        const tenant = await app.prisma.tenant.findUnique({
          where: { slug: params.tenantSlug },
        });
        if (!tenant) {
          throw notFound("Tenant no encontrado");
        }

        const normalizedPhone = normalizePhone(payload.phone);

        // Limite por telefono ademas del limite por IP: evita disparar envios masivos de OTP
        // (costo de SMS/WhatsApp) hacia un mismo numero desde muchas IPs.
        const recentRequests = await app.prisma.customerAuthSession.count({
          where: {
            tenantId: tenant.id,
            phone: normalizedPhone,
            createdAt: {
              gt: new Date(Date.now() - OTP_REQUEST_WINDOW_MINUTES * 60_000),
            },
          },
        });
        if (recentRequests >= OTP_REQUESTS_PER_PHONE) {
          throw tooManyRequests(
            `Ya solicitaste varios codigos. Intenta de nuevo en ${OTP_REQUEST_WINDOW_MINUTES} minutos`,
            "OTP_RATE_LIMITED",
          );
        }

        let fullName = payload.fullName;
        let email = payload.email;
        let providerUserId: string | undefined;

        if (payload.provider === "google") {
          if (!payload.googleIdToken) {
            throw badRequest("Falta googleIdToken");
          }
          const google = await resolveGoogleProfile(payload.googleIdToken);
          providerUserId = google.providerUserId;
          fullName = google.fullName;
          email = google.email ?? email;
        }

        if (payload.provider === "facebook") {
          if (!payload.facebookAccessToken) {
            throw badRequest("Falta facebookAccessToken");
          }
          const fb = await resolveFacebookProfile(payload.facebookAccessToken);
          providerUserId = fb.providerUserId;
          fullName = fb.fullName;
          email = fb.email ?? email;
        }

        if (!fullName) {
          throw badRequest("Nombre requerido");
        }

        const [whatsappEntitlement, smsEntitlement] = await Promise.all([
          app.prisma.tenantEntitlement.findUnique({
            where: {
              tenantId_key: {
                tenantId: tenant.id,
                key: "notifications.whatsapp.enabled",
              },
            },
          }),
          app.prisma.tenantEntitlement.findUnique({
            where: {
              tenantId_key: {
                tenantId: tenant.id,
                key: "notifications.sms.enabled",
              },
            },
          }),
        ]);

        const whatsappEnabled =
          (whatsappEntitlement?.valueJson as { enabled?: boolean } | undefined)
            ?.enabled === true;
        const smsEnabled =
          (smsEntitlement?.valueJson as { enabled?: boolean } | undefined)
            ?.enabled === true;
        if (!whatsappEnabled && !smsEnabled) {
          throw badRequest(
            "No hay canal de telefono habilitado (sms/whatsapp) para enviar OTP",
            "PHONE_CHANNEL_DISABLED",
          );
        }
        const channel = whatsappEnabled ? "whatsapp" : "sms";

        const code = randomOtpCode();
        const codeHash = await bcrypt.hash(code, 10);
        const expiresAt = new Date(
          Date.now() + env.OTP_EXPIRY_MINUTES * 60_000,
        );

        const session = await app.prisma.customerAuthSession.create({
          data: {
            tenantId: tenant.id,
            provider: payload.provider,
            providerUserId,
            fullName,
            email,
            phone: normalizedPhone,
            otpCodeHash: codeHash,
            otpExpiresAt: expiresAt,
            metadataJson: {
              userAgent: request.headers["user-agent"] ?? "unknown",
            },
          },
        });

        await app.prisma.notificationOutbox.create({
          data: {
            tenantId: tenant.id,
            channel,
            eventType: "auth.otp.requested",
            to: normalizedPhone,
            payloadJson: {
              code,
              message: `Tu codigo de verificacion es ${code}`,
              expiresInMinutes: env.OTP_EXPIRY_MINUTES,
            },
          },
        });

        return {
          ok: true,
          sessionId: session.id,
          expiresAt: expiresAt.toISOString(),
          phoneMasked: maskPhone(normalizedPhone),
          channel,
          ...(env.NODE_ENV === "development" ? { devOtpCode: code } : {}),
        };
      },
    );

    authApp.post("/public/:tenantSlug/auth/verify", async (request) => {
      const params = z.object({ tenantSlug: z.string() }).parse(request.params);
      const payload = verifySchema.parse(request.body);

      const tenant = await app.prisma.tenant.findUnique({
        where: { slug: params.tenantSlug },
      });
      if (!tenant) {
        throw notFound("Tenant no encontrado");
      }

      const session = await app.prisma.customerAuthSession.findFirst({
        where: {
          id: payload.sessionId,
          tenantId: tenant.id,
        },
      });

      if (!session) {
        throw notFound(
          "Sesion de verificacion no existe",
          "AUTH_SESSION_NOT_FOUND",
        );
      }
      if (session.otpVerifiedAt) {
        throw badRequest("Codigo ya utilizado");
      }
      if (session.otpExpiresAt.getTime() < Date.now()) {
        throw unauthorized("El codigo expiro");
      }

      // Reserva el intento de forma atomica antes de comparar, para que peticiones en paralelo
      // no puedan superar el maximo de intentos.
      const attempt = await app.prisma.customerAuthSession.updateMany({
        where: {
          id: session.id,
          otpVerifiedAt: null,
          attempts: { lt: MAX_VERIFY_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });
      if (attempt.count === 0) {
        throw unauthorized("Demasiados intentos");
      }

      const validCode = await bcrypt.compare(payload.code, session.otpCodeHash);
      if (!validCode) {
        throw unauthorized("Codigo incorrecto");
      }

      const customer = await app.prisma.$transaction(async (tx) => {
        const marked = await tx.customerAuthSession.updateMany({
          where: { id: session.id, otpVerifiedAt: null },
          data: { otpVerifiedAt: new Date() },
        });
        if (marked.count === 0) {
          throw badRequest("Codigo ya utilizado");
        }

        const existing = await tx.customer.findFirst({
          where: {
            tenantId: tenant.id,
            OR: [
              { phone: session.phone },
              session.email ? { email: session.email } : undefined,
            ].filter(Boolean) as Array<{ phone?: string; email?: string }>,
          },
        });

        if (existing) {
          return tx.customer.update({
            where: { id: existing.id },
            data: {
              fullName: session.fullName,
              phone: session.phone,
              email: session.email ?? existing.email,
            },
          });
        }

        return tx.customer.create({
          data: {
            tenantId: tenant.id,
            fullName: session.fullName,
            phone: session.phone,
            email: session.email,
          },
        });
      });

      const token = await app.jwt.sign(
        {
          type: "booking_customer",
          customerId: customer.id,
          tenantId: tenant.id,
          phone: customer.phone ?? undefined,
          email: customer.email ?? undefined,
        },
        { expiresIn: env.BOOKING_JWT_EXPIRES_IN },
      );

      return {
        ok: true,
        token,
        customer: {
          id: customer.id,
          fullName: customer.fullName,
          phone: customer.phone,
          email: customer.email,
        },
      };
    });
  });
}
