import { Prisma, type PrismaClient } from "@citas/db";
import { normalizePhone } from "@citas/shared/phone";
import { asRecord, toJsonValue } from "../../../shared/json.js";
import { tenantScope } from "../../../shared/tenant-scope.js";
import { loadTenantContext } from "../../tenancy/tenant-context.js";
import { mirrorInboundToChatwoot } from "../chatwoot-mirror.service.js";
import {
  captureName,
  chooseDate,
  chooseService,
  chooseSlot,
  chooseStaff,
  confirmBooking,
} from "./booking-flow.js";
import { COMMANDS, isCommand, normalizeCommand } from "./commands.js";
import {
  createConversation,
  type AssistantResult,
  type Conversation,
  type ConversationState,
  type InboundMessage,
} from "./conversation.js";
import { handleIdle } from "./idle-flow.js";
import { messages } from "./messages.js";
import {
  chooseRescheduleDate,
  chooseRescheduleSlot,
  confirmReschedule,
} from "./reschedule-flow.js";

export type { InboundMessage } from "./conversation.js";

const SESSION_TTL_MS = 24 * 60 * 60_000;

type Logger = { error: (payload: unknown, message?: string) => void };

const consoleLogger: Logger = {
  error: (payload, message) => console.error(message, payload),
};

/** Manejador de cada paso de un flujo, indexado por el estado guardado en la sesion. */
const FLOW_STEPS: Partial<
  Record<ConversationState, (c: Conversation) => Promise<AssistantResult>>
> = {
  booking_service: chooseService,
  booking_staff: chooseStaff,
  booking_date: chooseDate,
  booking_slot: chooseSlot,
  booking_name: captureName,
  booking_confirm: confirmBooking,
  awaiting_reschedule: chooseRescheduleDate,
  reschedule_slot: chooseRescheduleSlot,
  reschedule_confirm: confirmReschedule,
};

/** Preferencias de contacto y derivacion a recepcion: aplican en cualquier estado. */
async function handleGlobalCommands(
  c: Conversation,
): Promise<AssistantResult | undefined> {
  if (isCommand(c.command, COMMANDS.optOut)) {
    if (c.customer) {
      await c.scope.db.customer.update({
        where: { id: c.customer.id },
        data: { whatsappOptOutAt: new Date() },
      });
    }
    await c.moveTo("opted_out", null, { humanHandoff: false });
    await c.reply(messages.optedOut, "whatsapp.opt_out");
    return { handled: "opt_out" };
  }
  if (isCommand(c.command, COMMANDS.optIn)) {
    if (c.customer) {
      await c.scope.db.customer.update({
        where: { id: c.customer.id },
        data: { whatsappOptOutAt: null, whatsappOptInAt: new Date() },
      });
    }
    await c.moveTo("idle");
    await c.reply(messages.optedIn, "whatsapp.opt_in");
    return { handled: "opt_in" };
  }
  if (c.session.state === "opted_out") {
    return { ignored: true, reason: "opted_out" };
  }
  if (isCommand(c.command, COMMANDS.handoff)) {
    await c.moveTo("human_handoff", undefined, { humanHandoff: true });
    await c.reply(messages.handoff, "whatsapp.handoff_requested");
    return { handled: "handoff" };
  }
  if (c.session.humanHandoff) {
    if (!isCommand(c.command, COMMANDS.resumeBot)) {
      return { handled: "human_handoff_active" };
    }
    await c.moveTo("idle", undefined, { humanHandoff: false });
    return undefined;
  }
  return undefined;
}

async function recordInbound(prisma: PrismaClient, message: InboundMessage) {
  try {
    await prisma.whatsappMessage.create({
      data: {
        tenantId: message.tenantId,
        direction: "inbound",
        provider: message.provider,
        externalMessageId: message.externalMessageId,
        phone: message.phone,
        content: message.text,
        eventType: "message.received",
        deliveryStatus: "delivered",
        rawJson: toJsonValue(message.raw),
        receivedAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Procesa un mensaje entrante de WhatsApp: lo registra (deduplicando reintentos del
 * proveedor), lo copia a Chatwoot y responde segun el estado de la conversacion.
 */
export async function processInboundWhatsappMessage(
  prisma: PrismaClient,
  input: InboundMessage,
  log: Logger = consoleLogger,
): Promise<AssistantResult> {
  const message = { ...input, phone: normalizePhone(input.phone) };
  if (!message.phone || !message.externalMessageId) {
    return { ignored: true, reason: "missing_phone_or_message_id" };
  }
  if (!(await recordInbound(prisma, message))) {
    return { duplicate: true };
  }

  const scope = tenantScope(prisma, message.tenantId);
  const tenant = await loadTenantContext(scope.db, scope.tenantId).catch(
    () => undefined,
  );
  if (!tenant) {
    return { ignored: true, reason: "tenant_not_found" };
  }

  const now = new Date();
  const session = await scope.db.whatsappConversationSession.upsert({
    where: {
      tenantId_phone: { tenantId: scope.tenantId, phone: message.phone },
    },
    create: {
      tenantId: scope.tenantId,
      phone: message.phone,
      lastInboundAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    },
    update: {
      lastInboundAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    },
  });

  try {
    await mirrorInboundToChatwoot(scope, {
      phone: message.phone,
      name: message.pushName,
      content: message.text,
      externalMessageId: message.externalMessageId,
    });
  } catch (error) {
    // Chatwoot es opcional: si falla, el asistente sigue respondiendo.
    log.error(
      { err: error },
      "No se pudo copiar el mensaje entrante a Chatwoot",
    );
  }

  const customer = await scope.db.customer.findFirst({
    where: { phone: message.phone },
  });
  const conversation = createConversation({
    scope,
    tenant,
    message,
    command: normalizeCommand(message.text),
    session,
    flow: asRecord(session.contextJson),
    customer,
  });

  const globalResult = await handleGlobalCommands(conversation);
  if (globalResult) {
    return globalResult;
  }

  if (isCommand(conversation.command, COMMANDS.resetFlow)) {
    await conversation.moveTo("idle", null);
    return handleIdle(conversation);
  }
  const step = FLOW_STEPS[session.state as ConversationState];
  return step ? step(conversation) : handleIdle(conversation);
}
