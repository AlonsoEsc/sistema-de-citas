import type { PrismaClient } from "@citas/db";
import { decryptJson } from "@citas/shared/crypto";
import type {
  EvolutionConfig,
  WhatsappConfig,
} from "@citas/shared/integrations";
import { env, isProduction } from "../config.js";
import { payloadOf } from "../outbox/render.js";
import { sendTwilio } from "./twilio.js";
import {
  postWithTimeout,
  readBody,
  type Delivery,
  type SendResult,
} from "./types.js";

/** Conexion de WhatsApp del negocio; si no tiene, el numero de Twilio de la plataforma. */
async function whatsappConfigFor(
  prisma: PrismaClient,
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
    return decryptJson<WhatsappConfig>(
      connection.configEnc,
      env.ENCRYPTION_KEY,
    );
  }
  return env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_WHATSAPP_FROM
    ? {
        provider: "twilio",
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        from: env.TWILIO_WHATSAPP_FROM,
      }
    : undefined;
}

/** Plantilla de autenticacion de Meta: el codigo va en el cuerpo y en el boton de copiar. */
function authenticationComponents(code: string) {
  return [
    { type: "body", parameters: [{ type: "text", text: code }] },
    {
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: code }],
    },
  ];
}

/**
 * Envia por Evolution: con plantilla aprobada por Meta si la notificacion tiene una asociada
 * (obligatorio fuera de la ventana de 24 h), o como texto libre dentro de la ventana.
 */
async function sendEvolution(
  { item, message }: Delivery,
  config: EvolutionConfig,
): Promise<SendResult> {
  const template = message.providerTemplate?.evolution;
  const number = item.to.replace(/\D/g, "");
  const payload = payloadOf(item);
  const body = template
    ? {
        number,
        name: template.name,
        language: template.language ?? "es",
        components:
          template.components ??
          (template.kind === "authentication"
            ? authenticationComponents(String(payload.code ?? ""))
            : undefined) ??
          (template.parameterOrder?.length
            ? [
                {
                  type: "body",
                  parameters: template.parameterOrder.map((key) => ({
                    type: "text",
                    text: String(payload[key] ?? ""),
                  })),
                },
              ]
            : []),
      }
    : { number, text: message.body };

  const response = await postWithTimeout(
    `${config.baseUrl.replace(/\/$/, "")}/message/${template ? "sendTemplate" : "sendText"}/${encodeURIComponent(config.instanceName)}`,
    {
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const raw = await readBody(response);
  if (!response.ok) {
    throw new Error(
      `Evolution ${response.status}: ${String(raw.message ?? JSON.stringify(raw))}`,
    );
  }
  const key = raw.key as { id?: string } | undefined;
  const messageId = key?.id ?? raw.messageId ?? raw.id;
  return {
    provider: "evolution",
    messageId: typeof messageId === "string" ? messageId : undefined,
    raw,
  };
}

export async function sendWhatsapp(
  prisma: PrismaClient,
  delivery: Delivery,
): Promise<SendResult> {
  const config = await whatsappConfigFor(prisma, delivery.item.tenantId);
  if (!config) {
    if (!isProduction) {
      console.log(
        `[worker] whatsapp (desarrollo) -> ${delivery.item.to} evento=${delivery.item.eventType}`,
      );
      return { provider: "development" };
    }
    throw new Error(
      `El negocio ${delivery.item.tenantId} no tiene WhatsApp configurado`,
    );
  }
  return config.provider === "evolution"
    ? sendEvolution(delivery, config)
    : sendTwilio(delivery, config, "whatsapp");
}
