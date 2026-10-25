import type { PrismaClient } from "@citas/db";
import type { ChatwootConfig } from "@citas/shared/integrations";
import { asRecord, asRecordArray } from "../../shared/json.js";
import { decryptJson } from "../../shared/secrets.js";
import type { TenantTxScope } from "../../shared/tenant-scope.js";
import { chatwootRequest } from "../integrations/chatwoot.client.js";

function numericId(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

async function tenantChatwootConfig({ db, tenantId }: TenantTxScope) {
  const connection = await db.integrationConnection.findUnique({
    where: {
      tenantId_provider_scopeKey: {
        tenantId,
        provider: "chatwoot",
        scopeKey: "tenant",
      },
    },
  });
  if (connection?.status !== "connected" || !connection.configEnc) {
    return undefined;
  }
  return decryptJson<ChatwootConfig>(connection.configEnc);
}

async function findOrCreateContact(
  config: ChatwootConfig,
  tenantId: string,
  input: { phone: string; name?: string },
) {
  const account = `/api/v1/accounts/${config.accountId}`;
  const search = await chatwootRequest(
    config,
    `${account}/contacts/search?q=${encodeURIComponent(input.phone)}`,
  );
  const found = asRecordArray(search.payload)[0];
  const foundId = numericId(found?.id);
  if (found && foundId) {
    const inbox = asRecordArray(found.contact_inboxes).find(
      (entry) =>
        numericId(entry.inbox_id) === config.inboxId ||
        numericId(asRecord(entry.inbox).id) === config.inboxId,
    );
    return { contactId: foundId, sourceId: String(inbox?.source_id ?? "") };
  }

  const created = await chatwootRequest(config, `${account}/contacts`, {
    method: "POST",
    body: JSON.stringify({
      inbox_id: config.inboxId,
      name: input.name || input.phone,
      phone_number: input.phone,
      identifier: `${tenantId}:${input.phone}`,
      custom_attributes: { tenant_id: tenantId },
    }),
  });
  const payload = asRecord(created.payload);
  const contact = asRecord(
    payload.contact ?? asRecordArray(created.payload)[0] ?? created,
  );
  const contactId = numericId(contact.id);
  if (!contactId) {
    throw new Error("Chatwoot no devolvio el id del contacto");
  }
  return {
    contactId,
    sourceId: String(
      asRecord(payload.contact_inbox).source_id ?? contact.source_id ?? "",
    ),
  };
}

async function findOrCreateConversation(
  config: ChatwootConfig,
  tenantId: string,
  input: { phone: string; contactId: number; sourceId: string },
) {
  const account = `/api/v1/accounts/${config.accountId}`;
  const existing = await chatwootRequest(
    config,
    `${account}/contacts/${input.contactId}/conversations`,
  );
  const open = asRecordArray(existing.payload).find(
    (item) =>
      numericId(item.inbox_id) === config.inboxId &&
      ["open", "pending"].includes(String(item.status)),
  );
  const openId = numericId(open?.id);
  if (openId) {
    return openId;
  }
  const created = await chatwootRequest(config, `${account}/conversations`, {
    method: "POST",
    body: JSON.stringify({
      source_id: input.sourceId || `${tenantId}:${input.phone}`,
      inbox_id: config.inboxId,
      contact_id: input.contactId,
      status: "open",
      custom_attributes: { tenant_id: tenantId },
    }),
  });
  const conversationId = numericId(created.id);
  if (!conversationId) {
    throw new Error("Chatwoot no devolvio el id de la conversacion");
  }
  return conversationId;
}

/** Copia un mensaje entrante de WhatsApp a la bandeja de Chatwoot del negocio, si existe. */
export async function mirrorInboundToChatwoot(
  scope: TenantTxScope,
  input: {
    phone: string;
    name?: string;
    content: string;
    externalMessageId: string;
  },
) {
  const config = await tenantChatwootConfig(scope);
  if (!config) {
    return { configured: false as const };
  }
  const { tenantId, db } = scope;
  const { contactId, sourceId } = await findOrCreateContact(
    config,
    tenantId,
    input,
  );
  const conversationId = await findOrCreateConversation(config, tenantId, {
    phone: input.phone,
    contactId,
    sourceId,
  });

  await chatwootRequest(
    config,
    `/api/v1/accounts/${config.accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        content: input.content,
        message_type: "incoming",
        private: false,
        content_attributes: {
          external_message_id: input.externalMessageId,
          tenant_id: tenantId,
        },
      }),
    },
  );
  await db.whatsappConversationSession.update({
    where: { tenantId_phone: { tenantId, phone: input.phone } },
    data: {
      chatwootContactId: String(contactId),
      chatwootConversationId: String(conversationId),
    },
  });
  return { configured: true as const, contactId, conversationId };
}

/** Conexion de Chatwoot (de cualquier negocio) que corresponde a un webhook entrante. */
export async function findChatwootWebhookConnection(
  prisma: PrismaClient,
  connectionId: string,
) {
  const connection = await prisma.integrationConnection.findFirst({
    where: { id: connectionId, provider: "chatwoot", status: "connected" },
  });
  if (!connection?.configEnc) {
    return undefined;
  }
  const config = decryptJson<ChatwootConfig>(connection.configEnc);
  return { tenantId: connection.tenantId, secret: config.webhookSecret };
}
