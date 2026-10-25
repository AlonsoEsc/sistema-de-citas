import { maskPhone, normalizePhone } from "@citas/shared/phone";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { randomInt } from "node:crypto";
import { env } from "../../config.js";
import {
  badRequest,
  notFound,
  tooManyRequests,
  unauthorized,
} from "../../shared/errors.js";
import type { TenantScope } from "../../shared/tenant-scope.js";
import {
  BOOKING_CUSTOMER_TOKEN_TYPE,
  type BookingCustomerTokenPayload,
} from "../auth/tokens.js";
import { queueOtpMessage } from "../notifications/notification.service.js";
import {
  ENTITLEMENTS,
  isEnabled,
  loadEntitlements,
} from "../tenancy/entitlements.js";
import {
  resolveFacebookProfile,
  resolveGoogleProfile,
  type SocialProfile,
} from "./social-identity.js";

const MAX_VERIFY_ATTEMPTS = 5;
const OTP_REQUESTS_PER_PHONE = 3;
const OTP_REQUEST_WINDOW_MINUTES = 15;

export type StartOtpInput = {
  provider: "manual" | "google" | "facebook";
  phone: string;
  fullName?: string;
  email?: string;
  googleIdToken?: string;
  facebookAccessToken?: string;
};

async function socialProfileFor(
  input: StartOtpInput,
): Promise<SocialProfile | undefined> {
  if (input.provider === "google") {
    if (!input.googleIdToken) {
      throw badRequest("Falta googleIdToken");
    }
    return resolveGoogleProfile(input.googleIdToken);
  }
  if (input.provider === "facebook") {
    if (!input.facebookAccessToken) {
      throw badRequest("Falta facebookAccessToken");
    }
    return resolveFacebookProfile(input.facebookAccessToken);
  }
  return undefined;
}

/** Envia un codigo de un solo uso al telefono del cliente por WhatsApp o SMS. */
export async function startOtp(
  scope: TenantScope,
  input: StartOtpInput,
  metadata: { userAgent: string },
) {
  const { db, tenantId } = scope;
  const phone = normalizePhone(input.phone);
  if (phone.length < 8) {
    throw badRequest("Telefono invalido", "INVALID_PHONE");
  }

  // Limite por telefono ademas del limite por IP: evita disparar envios masivos de OTP
  // (costo de SMS/WhatsApp) hacia un mismo numero desde muchas IPs.
  const recentRequests = await db.customerAuthSession.count({
    where: {
      phone,
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

  const profile = await socialProfileFor(input);
  const fullName = profile?.fullName ?? input.fullName;
  if (!fullName) {
    throw badRequest("Nombre requerido", "NAME_REQUIRED");
  }

  const entitlements = await loadEntitlements(db);
  const channel = isEnabled(entitlements, ENTITLEMENTS.whatsappNotifications)
    ? "whatsapp"
    : isEnabled(entitlements, ENTITLEMENTS.smsNotifications)
      ? "sms"
      : undefined;
  if (!channel) {
    throw badRequest(
      "Este negocio no tiene un canal de telefono habilitado para enviar el codigo",
      "PHONE_CHANNEL_DISABLED",
    );
  }

  const code = String(randomInt(100_000, 1_000_000));
  const otpCodeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60_000);
  const session = await db.$transaction(async (tx) => {
    const created = await tx.customerAuthSession.create({
      data: {
        tenantId,
        provider: input.provider,
        providerUserId: profile?.providerUserId,
        fullName,
        email: profile?.email ?? input.email,
        phone,
        otpCodeHash,
        otpExpiresAt: expiresAt,
        metadataJson: { userAgent: metadata.userAgent },
      },
    });
    await queueOtpMessage(
      { tenantId, db: tx },
      { channel, phone, code, expiresInMinutes: env.OTP_EXPIRY_MINUTES },
    );
    return created;
  });

  return {
    ok: true as const,
    sessionId: session.id,
    expiresAt: expiresAt.toISOString(),
    phoneMasked: maskPhone(phone),
    channel,
    // Solo en desarrollo local, para probar sin proveedor de mensajeria.
    ...(env.NODE_ENV === "development" ? { devOtpCode: code } : {}),
  };
}

/** Verifica el codigo y devuelve un token de cliente para este negocio. */
export async function verifyOtp(
  scope: TenantScope,
  jwt: FastifyInstance["jwt"],
  input: { sessionId: string; code: string },
) {
  const { db, tenantId } = scope;
  const session = await db.customerAuthSession.findUnique({
    where: { id: input.sessionId },
  });
  if (!session) {
    throw notFound(
      "La sesion de verificacion no existe",
      "AUTH_SESSION_NOT_FOUND",
    );
  }
  if (session.otpVerifiedAt) {
    throw badRequest("Codigo ya utilizado", "OTP_ALREADY_USED");
  }
  if (session.otpExpiresAt.getTime() < Date.now()) {
    throw unauthorized("El codigo expiro", "OTP_EXPIRED");
  }

  // Reserva el intento de forma atomica antes de comparar, para que peticiones en paralelo
  // no puedan superar el maximo de intentos.
  const attempt = await db.customerAuthSession.updateMany({
    where: {
      id: session.id,
      otpVerifiedAt: null,
      attempts: { lt: MAX_VERIFY_ATTEMPTS },
    },
    data: { attempts: { increment: 1 } },
  });
  if (attempt.count === 0) {
    throw unauthorized("Demasiados intentos", "OTP_TOO_MANY_ATTEMPTS");
  }
  if (!(await bcrypt.compare(input.code, session.otpCodeHash))) {
    throw unauthorized("Codigo incorrecto", "OTP_INVALID");
  }

  const customer = await db.$transaction(async (tx) => {
    const marked = await tx.customerAuthSession.updateMany({
      where: { id: session.id, otpVerifiedAt: null },
      data: { otpVerifiedAt: new Date() },
    });
    if (marked.count === 0) {
      throw badRequest("Codigo ya utilizado", "OTP_ALREADY_USED");
    }

    const existing = await tx.customer.findFirst({
      where: {
        OR: [
          { phone: session.phone },
          ...(session.email ? [{ email: session.email }] : []),
        ],
      },
    });
    const data = {
      fullName: session.fullName,
      phone: session.phone,
      email: session.email ?? existing?.email ?? undefined,
    };
    return existing
      ? tx.customer.update({ where: { id: existing.id }, data })
      : tx.customer.create({ data: { tenantId, ...data } });
  });

  const token = jwt.sign(
    {
      type: BOOKING_CUSTOMER_TOKEN_TYPE,
      customerId: customer.id,
      tenantId,
      phone: customer.phone ?? undefined,
      email: customer.email ?? undefined,
    } satisfies BookingCustomerTokenPayload,
    { expiresIn: env.BOOKING_JWT_EXPIRES_IN },
  );

  return {
    ok: true as const,
    token,
    customer: {
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
    },
  };
}
