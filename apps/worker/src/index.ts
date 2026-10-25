import dotenv from "dotenv";
import { createDecipheriv } from "node:crypto";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Prisma,
  createPrismaClient,
  type NotificationChannel,
  type NotificationOutbox,
} from "@citas/db";

const currentDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(currentDir, "../../../.env") });
const localEnv =
  dotenv.config({ path: resolve(currentDir, "../.env") }).parsed ?? {};
for (const [key, value] of Object.entries(localEnv)) {
  if (value.trim().length > 0) {
    process.env[key] = value;
  }
}

const prisma = createPrismaClient();
const POLL_INTERVAL_MS = 15_000;
const MAX_BATCH = 25;
const WORKER_ID = `${hostname()}:${process.pid}`;

type NotificationPayload = {
  subject?: string;
  body?: string;
  message?: string;
  code?: string;
  customerName?: string;
  staffName?: string;
  services?: string[];
  startAt?: string;
  endAt?: string;
  appointmentId?: string;
  [key: string]: unknown;
};

type EvolutionConfig = {
  provider: "evolution";
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  webhookSecret?: string;
};

type TwilioConfig = {
  provider: "twilio";
  accountSid: string;
  authToken: string;
  from: string;
};

type WhatsappConfig = EvolutionConfig | TwilioConfig;

type SendResult = {
  provider: string;
  messageId?: string;
  raw?: unknown;
};

type ProviderTemplateConfig = {
  evolution?: {
    name: string;
    language?: string;
    parameterOrder?: string[];
    components?: unknown[];
  };
  twilioContentSid?: string;
};

function env(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function payloadOf(item: NotificationOutbox): NotificationPayload {
  if (
    item.payloadJson &&
    typeof item.payloadJson === "object" &&
    !Array.isArray(item.payloadJson)
  ) {
    return item.payloadJson as NotificationPayload;
  }
  return {};
}

function decryptJson<T>(value: string): T {
  const encryptionKey = env("ENCRYPTION_KEY");
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY is required to load tenant integrations");
  }
  const key = Buffer.from(encryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes encoded as base64");
  }
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted integration config");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

function interpolate(template: string, payload: NotificationPayload) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (current && typeof current === "object" && !Array.isArray(current)) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, payload);
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    return value === undefined || value === null ? "" : String(value);
  });
}

async function renderedMessage(item: NotificationOutbox) {
  const payload = payloadOf(item);
  const template = await prisma.notificationTemplate.findUnique({
    where: {
      tenantId_channel_eventType: {
        tenantId: item.tenantId,
        channel: item.channel,
        eventType: item.eventType,
      },
    },
  });
  const body = template?.body ?? payload.message ?? payload.body;
  const providerTemplate =
    template?.variablesJson &&
    typeof template.variablesJson === "object" &&
    !Array.isArray(template.variablesJson)
      ? (template.variablesJson as ProviderTemplateConfig)
      : undefined;
  if (body) {
    return {
      body: interpolate(body, payload),
      subject: interpolate(
        template?.subject ?? payload.subject ?? "Notificación de cita",
        payload,
      ),
      providerTemplate,
    };
  }
  if (payload.code) {
    return {
      body: `Tu código de verificación es ${payload.code}`,
      subject: "Código de verificación",
      providerTemplate,
    };
  }
  return {
    body: `Notificación ${item.eventType}`,
    subject: "Notificación de cita",
    providerTemplate,
  };
}

async function sendEmail(item: NotificationOutbox): Promise<SendResult> {
  const apiKey = env("SENDGRID_API_KEY");
  const fromEmail = env("EMAIL_FROM");
  if (!apiKey || !fromEmail) {
    if (env("NODE_ENV") === "production") {
      throw new Error("SendGrid is not configured");
    }
    console.log(`[worker] dev email -> ${item.to} event=${item.eventType}`);
    return { provider: "development" };
  }

  const message = await renderedMessage(item);
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: item.to }] }],
      from: {
        email: fromEmail,
        name: env("EMAIL_FROM_NAME") ?? "Sistema de Citas",
      },
      subject: message.subject,
      content: [{ type: "text/plain", value: message.body }],
    }),
  });
  if (!response.ok) {
    throw new Error(`SendGrid ${response.status}: ${await response.text()}`);
  }
  return {
    provider: "sendgrid",
    messageId: response.headers.get("x-message-id") ?? undefined,
  };
}

async function tenantWhatsappConfig(
  tenantId: string,
): Promise<WhatsappConfig | undefined> {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      tenantId_provider_scopeKey: {
        tenantId,
        provider: "whatsapp",
        scopeKey: "tenant",
      },
    },
  });
  if (connection?.status === "connected" && connection.configEnc) {
    return decryptJson<WhatsappConfig>(connection.configEnc);
  }

  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_WHATSAPP_FROM");
  return accountSid && authToken && from
    ? { provider: "twilio", accountSid, authToken, from }
    : undefined;
}

async function sendTwilio(
  item: NotificationOutbox,
  config: TwilioConfig,
  channel: Extract<NotificationChannel, "sms" | "whatsapp">,
): Promise<SendResult> {
  const message = await renderedMessage(item);
  const to =
    channel === "whatsapp" && !item.to.startsWith("whatsapp:")
      ? `whatsapp:${item.to}`
      : item.to;
  const body = new URLSearchParams({
    From: config.from,
    To: to,
    Body: message.body,
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  const raw = (await response.json()) as { sid?: string; message?: string };
  if (!response.ok) {
    throw new Error(
      `Twilio ${response.status}: ${raw.message ?? JSON.stringify(raw)}`,
    );
  }
  return { provider: "twilio", messageId: raw.sid, raw };
}

async function sendEvolution(
  item: NotificationOutbox,
  config: EvolutionConfig,
): Promise<SendResult> {
  const message = await renderedMessage(item);
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const template = message.providerTemplate?.evolution;
  const endpoint = template ? "sendTemplate" : "sendText";
  const templateComponents =
    template?.components ??
    (template?.parameterOrder?.length
      ? [
          {
            type: "body",
            parameters: template.parameterOrder.map((key) => ({
              type: "text",
              text: String(payloadOf(item)[key] ?? ""),
            })),
          },
        ]
      : []);
  const response = await fetch(
    `${baseUrl}/message/${endpoint}/${encodeURIComponent(config.instanceName)}`,
    {
      method: "POST",
      headers: {
        apikey: config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        template
          ? {
              number: item.to.replace(/\D/g, ""),
              name: template.name,
              language: template.language ?? "es",
              components: templateComponents,
            }
          : {
              number: item.to.replace(/\D/g, ""),
              text: message.body,
            },
      ),
    },
  );
  const raw = (await response.json()) as {
    key?: { id?: string };
    messageId?: string;
    id?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(
      `Evolution ${response.status}: ${raw.message ?? JSON.stringify(raw)}`,
    );
  }
  return {
    provider: "evolution",
    messageId: raw.key?.id ?? raw.messageId ?? raw.id,
    raw,
  };
}

async function sendNotification(item: NotificationOutbox): Promise<SendResult> {
  if (item.channel === "email") {
    return sendEmail(item);
  }
  if (item.channel === "sms") {
    const accountSid = env("TWILIO_ACCOUNT_SID");
    const authToken = env("TWILIO_AUTH_TOKEN");
    const from = env("TWILIO_SMS_FROM");
    if (!accountSid || !authToken || !from) {
      throw new Error("Twilio SMS is not configured");
    }
    return sendTwilio(
      item,
      { provider: "twilio", accountSid, authToken, from },
      "sms",
    );
  }

  const config = await tenantWhatsappConfig(item.tenantId);
  if (!config) {
    if (env("NODE_ENV") !== "production") {
      console.log(
        `[worker] dev whatsapp -> ${item.to} event=${item.eventType}`,
      );
      return { provider: "development" };
    }
    throw new Error(
      `WhatsApp integration is not configured for tenant ${item.tenantId}`,
    );
  }
  return config.provider === "evolution"
    ? sendEvolution(item, config)
    : sendTwilio(item, config, "whatsapp");
}

async function enqueueScheduledNotifications() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + POLL_INTERVAL_MS + 5_000);
  const catchupWindowMs = 30 * 60_000;
  const windows = [
    {
      eventType: "appointment.reminder_24h",
      start: new Date(now.getTime() + 24 * 60 * 60_000 - catchupWindowMs),
      end: new Date(windowEnd.getTime() + 24 * 60 * 60_000),
    },
    {
      eventType: "appointment.reminder_2h",
      start: new Date(now.getTime() + 2 * 60 * 60_000 - catchupWindowMs),
      end: new Date(windowEnd.getTime() + 2 * 60 * 60_000),
    },
  ];

  for (const window of windows) {
    const appointments = await prisma.appointment.findMany({
      where: {
        status: { in: ["pending", "confirmed"] },
        startAt: { gte: window.start, lt: window.end },
        customer: {
          phone: { not: null },
          whatsappOptOutAt: null,
        },
        tenant: {
          entitlements: {
            some: {
              key: "notifications.whatsapp.enabled",
              valueJson: { path: ["enabled"], equals: true },
            },
          },
        },
      },
      include: { customer: true, staff: true },
    });

    if (appointments.length) {
      await prisma.notificationOutbox.createMany({
        data: appointments.map((appointment) => ({
          tenantId: appointment.tenantId,
          channel: "whatsapp" as const,
          eventType: window.eventType,
          to: appointment.customer.phone as string,
          idempotencyKey: `${appointment.tenantId}:${appointment.id}:${window.eventType}:whatsapp`,
          scheduledFor: now,
          payloadJson: {
            appointmentId: appointment.id,
            customerName: appointment.customer.fullName,
            staffName: appointment.staff.displayName,
            startAt: appointment.startAt.toISOString(),
            endAt: appointment.endAt.toISOString(),
            message:
              window.eventType === "appointment.reminder_24h"
                ? `Hola ${appointment.customer.fullName}, te recordamos tu cita de mañana con ${appointment.staff.displayName}. Responde CONFIRMAR, REAGENDAR o CANCELAR.`
                : `Tu cita con ${appointment.staff.displayName} es en aproximadamente 2 horas.`,
          },
        })),
        skipDuplicates: true,
      });
    }
  }

  const followupStart = new Date(now.getTime() - 24 * 60 * 60_000);
  const followupEnd = new Date(windowEnd.getTime() - 2 * 60 * 60_000);
  const completed = await prisma.appointment.findMany({
    where: {
      status: "completed",
      endAt: { gte: followupStart, lt: followupEnd },
      customer: { phone: { not: null }, whatsappOptOutAt: null },
      tenant: {
        entitlements: {
          some: {
            key: "notifications.whatsapp.enabled",
            valueJson: { path: ["enabled"], equals: true },
          },
        },
      },
    },
    include: { customer: true, staff: true },
  });
  if (completed.length) {
    await prisma.notificationOutbox.createMany({
      data: completed.map((appointment) => ({
        tenantId: appointment.tenantId,
        channel: "whatsapp" as const,
        eventType: "appointment.followup",
        to: appointment.customer.phone as string,
        idempotencyKey: `${appointment.tenantId}:${appointment.id}:appointment.followup:whatsapp`,
        scheduledFor: now,
        payloadJson: {
          appointmentId: appointment.id,
          customerName: appointment.customer.fullName,
          staffName: appointment.staff.displayName,
          startAt: appointment.startAt.toISOString(),
          endAt: appointment.endAt.toISOString(),
          message: `Gracias por tu visita, ${appointment.customer.fullName}. ¿Cómo fue tu experiencia? Responde del 1 al 5.`,
        },
      })),
      skipDuplicates: true,
    });
  }

  const noShows = await prisma.appointment.findMany({
    where: {
      status: "no_show",
      endAt: {
        gte: new Date(now.getTime() - 7 * 24 * 60 * 60_000),
        lt: now,
      },
      customer: { phone: { not: null }, whatsappOptOutAt: null },
      tenant: {
        entitlements: {
          some: {
            key: "notifications.whatsapp.enabled",
            valueJson: { path: ["enabled"], equals: true },
          },
        },
      },
    },
    include: { customer: true, staff: true },
  });
  if (noShows.length) {
    await prisma.notificationOutbox.createMany({
      data: noShows.map((appointment) => ({
        tenantId: appointment.tenantId,
        channel: "whatsapp" as const,
        eventType: "appointment.no_show_followup",
        to: appointment.customer.phone as string,
        idempotencyKey: `${appointment.tenantId}:${appointment.id}:appointment.no_show_followup:whatsapp`,
        scheduledFor: now,
        payloadJson: {
          appointmentId: appointment.id,
          customerName: appointment.customer.fullName,
          staffName: appointment.staff.displayName,
          startAt: appointment.startAt.toISOString(),
          endAt: appointment.endAt.toISOString(),
          message: `Hola ${appointment.customer.fullName}, notamos que no pudiste asistir a tu cita. Responde AGENDAR para encontrar un nuevo horario o ASESOR si necesitas ayuda.`,
        },
      })),
      skipDuplicates: true,
    });
  }
}

async function claimPending() {
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  await prisma.notificationOutbox.updateMany({
    where: { status: "processing", lockedAt: { lt: staleBefore } },
    data: {
      status: "pending",
      lockedAt: null,
      lockedBy: null,
      nextRetryAt: new Date(),
    },
  });

  return prisma.$queryRaw<NotificationOutbox[]>(Prisma.sql`
    UPDATE "NotificationOutbox"
    SET
      "status" = 'processing'::"OutboxStatus",
      "attempts" = "attempts" + 1,
      "lockedAt" = NOW(),
      "lockedBy" = ${WORKER_ID}
    WHERE "id" IN (
      SELECT "id"
      FROM "NotificationOutbox"
      WHERE "status" = 'pending'::"OutboxStatus"
        AND ("scheduledFor" IS NULL OR "scheduledFor" <= NOW())
        AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${MAX_BATCH}
    )
    RETURNING *
  `);
}

async function processOutbox() {
  const pending = await claimPending();
  for (const item of pending) {
    try {
      const result = await sendNotification(item);
      const sentAt = new Date();
      await prisma.$transaction([
        prisma.notificationOutbox.update({
          where: { id: item.id },
          data: {
            status: "sent",
            provider: result.provider,
            providerMessageId: result.messageId,
            sentAt,
            lastError: null,
            lockedAt: null,
            lockedBy: null,
          },
        }),
        ...(item.channel === "whatsapp"
          ? [
              prisma.whatsappMessage.upsert({
                where: { outboxId: item.id },
                create: {
                  tenantId: item.tenantId,
                  outboxId: item.id,
                  appointmentId:
                    typeof payloadOf(item).appointmentId === "string"
                      ? payloadOf(item).appointmentId
                      : undefined,
                  direction: "outbound",
                  provider: result.provider,
                  externalMessageId: result.messageId,
                  phone: item.to,
                  content: (await renderedMessage(item)).body,
                  eventType: item.eventType,
                  deliveryStatus: "sent",
                  rawJson: result.raw as Prisma.InputJsonValue | undefined,
                  sentAt,
                },
                update: {
                  provider: result.provider,
                  externalMessageId: result.messageId,
                  deliveryStatus: "sent",
                  rawJson: result.raw as Prisma.InputJsonValue | undefined,
                  sentAt,
                },
              }),
              prisma.whatsappConversationSession.updateMany({
                where: {
                  tenantId: item.tenantId,
                  phone: item.to,
                },
                data: { lastOutboundAt: sentAt },
              }),
            ]
          : []),
      ]);
    } catch (error) {
      const retryMinutes = Math.min(60, Math.pow(2, item.attempts));
      const failed = item.attempts >= 7;
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: {
          status: failed ? "failed" : "pending",
          lastError: error instanceof Error ? error.message : "Unknown error",
          nextRetryAt: new Date(Date.now() + retryMinutes * 60_000),
          lockedAt: null,
          lockedBy: null,
        },
      });
    }
  }
}

async function tick() {
  try {
    await enqueueScheduledNotifications();
    await processOutbox();
  } catch (error) {
    console.error("[worker] tick failed", error);
  }
}

async function start() {
  console.log(`[worker] started id=${WORKER_ID}`);
  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function shutdown() {
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
