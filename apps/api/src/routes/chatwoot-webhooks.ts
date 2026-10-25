import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@citas/db";
import { z } from "zod";
import { getChatwootWebhookSecret } from "../services/chatwoot-service.js";
import {
  normalizePhone,
  queueWhatsappReply,
} from "../services/notification-service.js";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function chatwootWebhookRoutes(app: FastifyInstance) {
  app.post("/webhooks/chatwoot/:connectionId", async (request, reply) => {
    const params = z
      .object({ connectionId: z.string().uuid() })
      .parse(request.params);
    const query = z
      .object({ token: z.string().optional() })
      .parse(request.query ?? {});
    const integration = await getChatwootWebhookSecret(
      app.prisma,
      params.connectionId,
    );
    if (!integration) {
      return reply.status(404).send({ ok: false });
    }
    const receivedSecret = String(
      request.headers["x-webhook-secret"] ?? query.token ?? "",
    );
    if (!receivedSecret || !secureEqual(receivedSecret, integration.secret)) {
      return reply.status(401).send({ ok: false });
    }

    const payload = z.record(z.string(), z.unknown()).parse(request.body ?? {});
    if (String(payload.event) !== "message_created") {
      return { ok: true, ignored: true };
    }
    const messageType = payload.message_type;
    if (
      !["outgoing", 1].includes(messageType as string | number) ||
      payload.private === true
    ) {
      return { ok: true, ignored: true };
    }

    const conversation = record(payload.conversation);
    const meta = record(conversation.meta);
    const sender = record(meta.sender);
    const contactInbox = record(payload.contact_inbox);
    const contact = record(contactInbox.contact);
    const phone = normalizePhone(
      String(
        sender.phone_number ??
          contact.phone_number ??
          payload.phone_number ??
          "",
      ),
    );
    const content = String(payload.content ?? "").trim();
    const messageId = String(payload.id ?? "");
    if (!phone || !content || !messageId) {
      return { ok: true, ignored: true };
    }

    const normalizedContent = content.trim().toLowerCase();
    if (["#bot", "/bot", "devolver al bot"].includes(normalizedContent)) {
      await app.prisma.whatsappConversationSession.upsert({
        where: {
          tenantId_phone: {
            tenantId: integration.connection.tenantId,
            phone,
          },
        },
        create: {
          tenantId: integration.connection.tenantId,
          phone,
          state: "idle",
          humanHandoff: false,
          chatwootConversationId: String(conversation.id ?? ""),
        },
        update: {
          state: "idle",
          humanHandoff: false,
          contextJson: Prisma.JsonNull,
          chatwootConversationId: String(conversation.id ?? ""),
        },
      });
      await queueWhatsappReply(app.prisma, {
        tenantId: integration.connection.tenantId,
        phone,
        message:
          "El asistente automático está activo nuevamente. Escribe MENU para ver las opciones.",
        eventType: "chatwoot.bot.resumed",
        idempotencyKey: `${integration.connection.tenantId}:chatwoot:${messageId}:bot-resumed`,
      });
      return { ok: true, botResumed: true };
    }

    await app.prisma.whatsappConversationSession.upsert({
      where: {
        tenantId_phone: {
          tenantId: integration.connection.tenantId,
          phone,
        },
      },
      create: {
        tenantId: integration.connection.tenantId,
        phone,
        state: "human_handoff",
        humanHandoff: true,
        chatwootConversationId: String(conversation.id ?? ""),
      },
      update: {
        state: "human_handoff",
        humanHandoff: true,
        chatwootConversationId: String(conversation.id ?? ""),
      },
    });
    await queueWhatsappReply(app.prisma, {
      tenantId: integration.connection.tenantId,
      phone,
      message: content,
      eventType: "chatwoot.agent.reply",
      idempotencyKey: `${integration.connection.tenantId}:chatwoot:${messageId}:outgoing`,
    });
    return { ok: true };
  });
}
