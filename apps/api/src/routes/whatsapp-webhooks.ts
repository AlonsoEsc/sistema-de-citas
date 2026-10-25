import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { decryptJson } from "../lib/secrets.js";
import { processInboundWhatsappMessage } from "../services/whatsapp-assistant.js";

type WhatsappConfig = {
  provider?: "evolution" | "twilio" | "meta_cloud";
  apiKey?: string;
  webhookSecret?: string;
};

type EvolutionKey = {
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
};

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function evolutionText(data: Record<string, unknown>) {
  const message = (data.message ?? {}) as Record<string, unknown>;
  const extended = (message.extendedTextMessage ?? {}) as Record<
    string,
    unknown
  >;
  const buttons = (message.buttonsResponseMessage ?? {}) as Record<
    string,
    unknown
  >;
  const list = (message.listResponseMessage ?? {}) as Record<string, unknown>;
  const single = (list.singleSelectReply ?? {}) as Record<string, unknown>;
  return String(
    message.conversation ??
      extended.text ??
      buttons.selectedDisplayText ??
      buttons.selectedButtonId ??
      list.title ??
      single.selectedRowId ??
      "",
  ).trim();
}

function phoneFromJid(jid?: string) {
  if (!jid || jid.endsWith("@lid") || jid.endsWith("@g.us")) {
    return "";
  }
  const digits = jid.split("@")[0]?.replace(/\D/g, "") ?? "";
  return digits ? `+${digits}` : "";
}

export async function whatsappWebhookRoutes(app: FastifyInstance) {
  app.post(
    "/webhooks/whatsapp/evolution/:connectionId",
    async (request, reply) => {
      const params = z
        .object({ connectionId: z.string().uuid() })
        .parse(request.params);
      const query = z
        .object({ token: z.string().optional() })
        .parse(request.query ?? {});
      const connection = await app.prisma.integrationConnection.findFirst({
        where: {
          id: params.connectionId,
          provider: "whatsapp",
          status: { in: ["pending", "connected"] },
        },
      });
      if (!connection?.configEnc) {
        return reply.status(404).send({ ok: false });
      }

      const config = decryptJson<WhatsappConfig>(connection.configEnc);
      const receivedSecret = String(
        request.headers["x-webhook-secret"] ??
          request.headers.apikey ??
          query.token ??
          "",
      );
      const expectedSecret = config.webhookSecret ?? config.apiKey ?? "";
      if (
        !receivedSecret ||
        !expectedSecret ||
        !secureEqual(receivedSecret, expectedSecret)
      ) {
        return reply.status(401).send({ ok: false });
      }

      const payload = z
        .record(z.string(), z.unknown())
        .parse(request.body ?? {});
      const event = String(payload.event ?? "").toLowerCase();
      const rawData = payload.data;
      const data = (
        Array.isArray(rawData) ? rawData[0] : (rawData ?? {})
      ) as Record<string, unknown>;
      const key = (data.key ?? {}) as EvolutionKey;

      if (event.includes("connection.update")) {
        const state = String(
          data.state ??
            data.status ??
            payload.state ??
            payload.status ??
            "unknown",
        ).toLowerCase();
        const connected = ["open", "connected"].includes(state);
        const metadata =
          connection.metadataJson &&
          typeof connection.metadataJson === "object" &&
          !Array.isArray(connection.metadataJson)
            ? (connection.metadataJson as Record<string, unknown>)
            : {};
        await app.prisma.integrationConnection.update({
          where: { id: connection.id },
          data: {
            status: connected ? "connected" : "pending",
            connectedAt: connected ? new Date() : null,
            lastError: connected ? null : connection.lastError,
            metadataJson: {
              ...metadata,
              evolutionState: state,
            },
          },
        });
        return { ok: true, state, connected };
      }

      if (event.includes("messages.update") || event.includes("send.message")) {
        const externalMessageId = key.id ?? String(data.id ?? "");
        const rawStatus = String(
          data.status ?? payload.status ?? "",
        ).toLowerCase();
        const status = rawStatus.includes("read")
          ? "read"
          : rawStatus.includes("deliver")
            ? "delivered"
            : rawStatus.includes("fail") || rawStatus.includes("error")
              ? "failed"
              : "sent";
        if (externalMessageId) {
          const now = new Date();
          await app.prisma.notificationOutbox.updateMany({
            where: {
              tenantId: connection.tenantId,
              providerMessageId: externalMessageId,
            },
            data: {
              deliveredAt:
                status === "delivered" || status === "read" ? now : undefined,
              readAt: status === "read" ? now : undefined,
              lastError:
                status === "failed"
                  ? "Evolution reported delivery failure"
                  : undefined,
            },
          });
          await app.prisma.whatsappMessage.updateMany({
            where: {
              tenantId: connection.tenantId,
              provider: "evolution",
              externalMessageId,
            },
            data: {
              deliveryStatus: status,
              deliveredAt:
                status === "delivered" || status === "read" ? now : undefined,
              readAt: status === "read" ? now : undefined,
              failedAt: status === "failed" ? now : undefined,
              rawJson: payload as Prisma.InputJsonValue,
            },
          });
        }
        return { ok: true };
      }

      if (!event.includes("messages.upsert") || key.fromMe) {
        return { ok: true, ignored: true };
      }

      const phone = phoneFromJid(key.remoteJid);
      const text = evolutionText(data);
      if (!phone || !text || !key.id) {
        return { ok: true, ignored: true };
      }

      const result = await processInboundWhatsappMessage(app.prisma, {
        tenantId: connection.tenantId,
        provider: "evolution",
        externalMessageId: key.id,
        phone,
        text,
        pushName: typeof data.pushName === "string" ? data.pushName : undefined,
        raw: payload,
      });
      return { ok: true, result };
    },
  );
}
