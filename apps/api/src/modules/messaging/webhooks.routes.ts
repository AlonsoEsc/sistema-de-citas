import { Prisma } from "@citas/db";
import type { WhatsappConfig } from "@citas/shared/integrations";
import { normalizePhone } from "@citas/shared/phone";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { asRecord, toJsonValue } from "../../shared/json.js";
import { decryptJson } from "../../shared/secrets.js";
import { secureEqual } from "../../shared/secure-compare.js";
import { tenantScope } from "../../shared/tenant-scope.js";
import { queueWhatsappReply } from "../notifications/notification.service.js";
import { processInboundWhatsappMessage } from "./assistant/index.js";
import { findChatwootWebhookConnection } from "./chatwoot-mirror.service.js";
import {
  connectionStateOf,
  deliveryStatusOf,
  evolutionEvent,
  messageText,
  phoneFromJid,
} from "./evolution-payload.js";

const tags = ["webhooks"];
const connectionParams = z.object({ connectionId: z.uuid() });
const tokenQuery = z.object({ token: z.string().optional() }).default({});
const anyPayload = z.record(z.string(), z.unknown()).default({});

/** Comandos que un agente escribe en Chatwoot para devolver la conversacion al asistente. */
const RESUME_BOT_COMMANDS = ["#bot", "/bot", "devolver al bot"];

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function webhookRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.post(
    "/webhooks/whatsapp/evolution/:connectionId",
    {
      schema: {
        tags,
        summary: "Eventos de Evolution API (mensajes, estados y conexion)",
        params: connectionParams,
        querystring: tokenQuery,
        body: anyPayload,
      },
    },
    async (request, reply) => {
      const connection = await app.prisma.integrationConnection.findFirst({
        where: {
          id: request.params.connectionId,
          provider: "whatsapp",
          status: { in: ["pending", "connected"] },
        },
      });
      if (!connection?.configEnc) {
        return reply.status(404).send({ ok: false });
      }
      const config = decryptJson<WhatsappConfig>(connection.configEnc);
      const expectedSecret =
        config.provider === "evolution"
          ? (config.webhookSecret ?? config.apiKey)
          : "";
      const receivedSecret =
        headerValue(request.headers["x-webhook-secret"]) ??
        headerValue(request.headers.apikey) ??
        request.query.token ??
        "";
      if (!expectedSecret || !secureEqual(receivedSecret, expectedSecret)) {
        return reply.status(401).send({ ok: false });
      }

      const payload = request.body;
      const { event, data, key } = evolutionEvent(payload);
      const { db, tenantId } = tenantScope(app.prisma, connection.tenantId);

      if (event.includes("connection.update")) {
        const state = connectionStateOf(data, payload);
        const connected = ["open", "connected"].includes(state);
        await db.integrationConnection.update({
          where: { id: connection.id },
          data: {
            status: connected ? "connected" : "pending",
            connectedAt: connected ? new Date() : null,
            lastError: connected ? null : connection.lastError,
            metadataJson: {
              ...asRecord(connection.metadataJson),
              evolutionState: state,
            } as Prisma.InputJsonValue,
          },
        });
        return { ok: true, state, connected };
      }

      if (event.includes("messages.update") || event.includes("send.message")) {
        const externalMessageId = key.id ?? String(data.id ?? "");
        if (externalMessageId) {
          const status = deliveryStatusOf(data, payload);
          const now = new Date();
          const delivered = status === "delivered" || status === "read";
          await db.notificationOutbox.updateMany({
            where: { providerMessageId: externalMessageId },
            data: {
              deliveredAt: delivered ? now : undefined,
              readAt: status === "read" ? now : undefined,
              lastError:
                status === "failed"
                  ? "Evolution reporto un fallo de entrega"
                  : undefined,
            },
          });
          await db.whatsappMessage.updateMany({
            where: { provider: "evolution", externalMessageId },
            data: {
              deliveryStatus: status,
              deliveredAt: delivered ? now : undefined,
              readAt: status === "read" ? now : undefined,
              failedAt: status === "failed" ? now : undefined,
              rawJson: toJsonValue(payload),
            },
          });
        }
        return { ok: true };
      }

      if (!event.includes("messages.upsert") || key.fromMe) {
        return { ok: true, ignored: true };
      }
      const phone = phoneFromJid(key.remoteJid);
      const text = messageText(data);
      if (!phone || !text || !key.id) {
        return { ok: true, ignored: true };
      }
      const result = await processInboundWhatsappMessage(
        app.prisma,
        {
          tenantId,
          provider: "evolution",
          externalMessageId: key.id,
          phone,
          text,
          pushName:
            typeof data.pushName === "string" ? data.pushName : undefined,
          raw: payload,
        },
        request.log,
      );
      return { ok: true, result };
    },
  );

  routes.post(
    "/webhooks/chatwoot/:connectionId",
    {
      schema: {
        tags,
        summary: "Respuestas de agentes humanos desde Chatwoot",
        params: connectionParams,
        querystring: tokenQuery,
        body: anyPayload,
      },
    },
    async (request, reply) => {
      const integration = await findChatwootWebhookConnection(
        app.prisma,
        request.params.connectionId,
      );
      if (!integration) {
        return reply.status(404).send({ ok: false });
      }
      const receivedSecret =
        headerValue(request.headers["x-webhook-secret"]) ??
        request.query.token ??
        "";
      if (!secureEqual(receivedSecret, integration.secret)) {
        return reply.status(401).send({ ok: false });
      }

      const payload = request.body;
      const isAgentMessage =
        String(payload.event) === "message_created" &&
        ["outgoing", 1].includes(payload.message_type as string | number) &&
        payload.private !== true;
      if (!isAgentMessage) {
        return { ok: true, ignored: true };
      }

      const conversation = asRecord(payload.conversation);
      const sender = asRecord(asRecord(conversation.meta).sender);
      const contact = asRecord(asRecord(payload.contact_inbox).contact);
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

      const scope = tenantScope(app.prisma, integration.tenantId);
      const chatwootConversationId = String(conversation.id ?? "");
      const sessionKey = {
        tenantId_phone: { tenantId: scope.tenantId, phone },
      };
      const idempotencyPrefix = `${scope.tenantId}:chatwoot:${messageId}`;

      if (RESUME_BOT_COMMANDS.includes(content.toLowerCase())) {
        await scope.db.whatsappConversationSession.upsert({
          where: sessionKey,
          create: {
            tenantId: scope.tenantId,
            phone,
            state: "idle",
            humanHandoff: false,
            chatwootConversationId,
          },
          update: {
            state: "idle",
            humanHandoff: false,
            contextJson: Prisma.JsonNull,
            chatwootConversationId,
          },
        });
        await queueWhatsappReply(scope, {
          phone,
          message:
            "El asistente automático está activo nuevamente. Escribe MENU para ver las opciones.",
          eventType: "chatwoot.bot.resumed",
          idempotencyKey: `${idempotencyPrefix}:bot-resumed`,
        });
        return { ok: true, botResumed: true };
      }

      await scope.db.whatsappConversationSession.upsert({
        where: sessionKey,
        create: {
          tenantId: scope.tenantId,
          phone,
          state: "human_handoff",
          humanHandoff: true,
          chatwootConversationId,
        },
        update: {
          state: "human_handoff",
          humanHandoff: true,
          chatwootConversationId,
        },
      });
      await queueWhatsappReply(scope, {
        phone,
        message: content,
        eventType: "chatwoot.agent.reply",
        idempotencyKey: `${idempotencyPrefix}:outgoing`,
      });
      return { ok: true };
    },
  );
}
