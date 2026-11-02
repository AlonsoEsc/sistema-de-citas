import { Prisma, type NotificationOutbox, type PrismaClient } from "@citas/db";
import { sendMode } from "../config.js";
import { sendEmail } from "../channels/email.js";
import { sendSms } from "../channels/twilio.js";
import type { Delivery, SendResult } from "../channels/types.js";
import { sendWhatsapp } from "../channels/whatsapp.js";
import { payloadOf, renderMessage } from "./render.js";
import { retryDecision } from "./retry.js";

/** Un envio "processing" mas antiguo que esto se considera abandonado (worker caido). */
const STALE_LOCK_MS = 10 * 60_000;

/**
 * Reclama un lote de notificaciones pendientes de forma atomica (FOR UPDATE SKIP LOCKED):
 * varios workers pueden correr en paralelo sin enviar dos veces lo mismo.
 */
async function claimPending(
  prisma: PrismaClient,
  workerId: string,
  batchSize: number,
) {
  await prisma.notificationOutbox.updateMany({
    where: {
      status: "processing",
      lockedAt: { lt: new Date(Date.now() - STALE_LOCK_MS) },
    },
    data: {
      status: "pending",
      lockedAt: null,
      lockedBy: null,
      nextRetryAt: new Date(),
    },
  });

  return prisma.$queryRaw<NotificationOutbox[]>(Prisma.sql`
    UPDATE "NotificationOutbox"
    SET "status" = 'processing'::"OutboxStatus",
        "attempts" = "attempts" + 1,
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId}
    WHERE "id" IN (
      SELECT "id" FROM "NotificationOutbox"
      WHERE "status" = 'pending'::"OutboxStatus"
        AND ("scheduledFor" IS NULL OR "scheduledFor" <= NOW())
        AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    RETURNING *
  `);
}

async function send(
  prisma: PrismaClient,
  delivery: Delivery,
): Promise<SendResult> {
  if (sendMode === "log") {
    console.log(
      `[worker] envio simulado ${delivery.item.channel} -> ${delivery.item.to} evento=${delivery.item.eventType}`,
    );
    return { provider: "log" };
  }
  switch (delivery.item.channel) {
    case "email":
      return sendEmail(delivery);
    case "sms":
      return sendSms(delivery);
    case "whatsapp":
      return sendWhatsapp(prisma, delivery);
  }
}

async function markSent(
  prisma: PrismaClient,
  { item, message }: Delivery,
  result: SendResult,
) {
  const sentAt = new Date();
  const appointmentId = payloadOf(item).appointmentId;
  const raw = result.raw as Prisma.InputJsonValue | undefined;

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
    // WhatsApp ademas queda en el historial de la conversacion del negocio.
    ...(item.channel === "whatsapp"
      ? [
          prisma.whatsappMessage.upsert({
            where: { outboxId: item.id },
            create: {
              tenantId: item.tenantId,
              outboxId: item.id,
              appointmentId:
                typeof appointmentId === "string" ? appointmentId : undefined,
              direction: "outbound",
              provider: result.provider,
              externalMessageId: result.messageId,
              phone: item.to,
              content: message.body,
              eventType: item.eventType,
              deliveryStatus: "sent",
              rawJson: raw,
              sentAt,
            },
            update: {
              provider: result.provider,
              externalMessageId: result.messageId,
              deliveryStatus: "sent",
              rawJson: raw,
              sentAt,
            },
          }),
          prisma.whatsappConversationSession.updateMany({
            where: { tenantId: item.tenantId, phone: item.to },
            data: { lastOutboundAt: sentAt },
          }),
        ]
      : []),
  ]);
}

async function markSkipped(prisma: PrismaClient, item: NotificationOutbox) {
  await prisma.notificationOutbox.update({
    where: { id: item.id },
    data: { status: "skipped", lockedAt: null, lockedBy: null },
  });
}

async function markFailedAttempt(
  prisma: PrismaClient,
  item: NotificationOutbox,
  error: unknown,
) {
  const { failed, nextRetryAt } = retryDecision(item.attempts);
  await prisma.notificationOutbox.update({
    where: { id: item.id },
    data: {
      status: failed ? "failed" : "pending",
      lastError: error instanceof Error ? error.message : "Error desconocido",
      nextRetryAt,
      lockedAt: null,
      lockedBy: null,
    },
  });
}

/** Envia un lote del outbox. Devuelve cuantas notificaciones se procesaron. */
export async function processOutbox(
  prisma: PrismaClient,
  options: { workerId: string; batchSize: number },
) {
  const pending = await claimPending(
    prisma,
    options.workerId,
    options.batchSize,
  );
  for (const item of pending) {
    try {
      const message = await renderMessage(prisma, item);
      if (!message) {
        await markSkipped(prisma, item);
        continue;
      }
      const delivery = { item, message };
      await markSent(prisma, delivery, await send(prisma, delivery));
    } catch (error) {
      await markFailedAttempt(prisma, item, error);
    }
  }
  return pending.length;
}
