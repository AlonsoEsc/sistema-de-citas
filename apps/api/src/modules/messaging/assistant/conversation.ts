import {
  Prisma,
  type Customer,
  type WhatsappConversationSession,
} from "@citas/db";
import { toJsonValue, type JsonRecord } from "../../../shared/json.js";
import type { TenantScope } from "../../../shared/tenant-scope.js";
import { queueWhatsappReply } from "../../notifications/notification.service.js";
import type { TenantContext } from "../../tenancy/tenant-context.js";

export type InboundMessage = {
  tenantId: string;
  provider: string;
  externalMessageId: string;
  phone: string;
  text: string;
  pushName?: string;
  raw: unknown;
};

/** Estados de la conversacion guardados en WhatsappConversationSession.state. */
export type ConversationState =
  | "idle"
  | "opted_out"
  | "human_handoff"
  | "booking_service"
  | "booking_staff"
  | "booking_date"
  | "booking_slot"
  | "booking_name"
  | "booking_confirm"
  | "awaiting_reschedule"
  | "reschedule_slot"
  | "reschedule_confirm";

/** Resultado de procesar un mensaje: que paso se ejecuto, o por que se ignoro. */
export type AssistantResult = {
  handled?: string;
  appointmentId?: string;
  ignored?: true;
  reason?: string;
  duplicate?: true;
};

/** Todo lo que un paso de la conversacion necesita, sin depender de Fastify ni del webhook. */
export type Conversation = {
  scope: TenantScope;
  tenant: TenantContext;
  message: InboundMessage;
  /** Texto normalizado (ver normalizeCommand). */
  command: string;
  session: WhatsappConversationSession;
  /** Datos acumulados del flujo en curso (contextJson). */
  flow: JsonRecord;
  customer: Customer | null;
  reply(text: string, eventType: string, appointmentId?: string): Promise<void>;
  /** Cambia de estado; `flow: null` borra los datos del flujo, `undefined` los conserva. */
  moveTo(
    state: ConversationState,
    flow?: JsonRecord | null,
    extra?: { humanHandoff?: boolean },
  ): Promise<void>;
};

export function createConversation(input: {
  scope: TenantScope;
  tenant: TenantContext;
  message: InboundMessage;
  command: string;
  session: WhatsappConversationSession;
  flow: JsonRecord;
  customer: Customer | null;
}): Conversation {
  const { scope, message, session } = input;
  return {
    ...input,
    async reply(text, eventType, appointmentId) {
      await queueWhatsappReply(scope, {
        phone: message.phone,
        message: text,
        eventType,
        appointmentId,
        idempotencyKey: `${scope.tenantId}:${message.provider}:${message.externalMessageId}:reply:${eventType}`,
      });
    },
    async moveTo(state, flow, extra = {}) {
      await scope.db.whatsappConversationSession.update({
        where: { id: session.id },
        data: {
          state,
          ...(flow === null
            ? { contextJson: Prisma.JsonNull }
            : flow
              ? { contextJson: toJsonValue(flow) }
              : {}),
          ...extra,
        },
      });
    },
  };
}

/** Lee una lista de strings guardada en el flujo. */
export function flowStrings(flow: JsonRecord, key: string) {
  const value = flow[key];
  return Array.isArray(value) ? value.map(String) : [];
}
