import type { PrismaClient } from "@prisma/client";
import { decryptJson } from "../lib/secrets.js";

type ChatwootConfig = {
  baseUrl: string;
  apiToken: string;
  accountId: number;
  inboxId: number;
  webhookSecret: string;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function array(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

async function chatwootRequest(
  config: ChatwootConfig,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      api_access_token: config.apiToken,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    throw new Error(
      `Chatwoot ${response.status}: ${String(body.message ?? JSON.stringify(body))}`,
    );
  }
  return body;
}

async function tenantChatwootConfig(prisma: PrismaClient, tenantId: string) {
  const connection = await prisma.integrationConnection.findUnique({
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

function numericId(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function mirrorInboundToChatwoot(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    phone: string;
    name?: string;
    content: string;
    externalMessageId: string;
  },
) {
  const config = await tenantChatwootConfig(prisma, input.tenantId);
  if (!config) {
    return { configured: false };
  }

  const search = await chatwootRequest(
    config,
    `/api/v1/accounts/${config.accountId}/contacts/search?q=${encodeURIComponent(input.phone)}`,
  );
  const searchPayload = array(search.payload);
  let contact = searchPayload[0];
  let contactId = numericId(contact?.id);
  let sourceId = String(
    array(contact?.contact_inboxes).find(
      (entry) =>
        numericId(entry.inbox_id) === config.inboxId ||
        numericId(record(entry.inbox).id) === config.inboxId,
    )?.source_id ?? "",
  );

  if (!contactId) {
    const created = await chatwootRequest(
      config,
      `/api/v1/accounts/${config.accountId}/contacts`,
      {
        method: "POST",
        body: JSON.stringify({
          inbox_id: config.inboxId,
          name: input.name || input.phone,
          phone_number: input.phone,
          identifier: `${input.tenantId}:${input.phone}`,
          custom_attributes: { tenant_id: input.tenantId },
        }),
      },
    );
    const payload = record(created.payload);
    contact = record(payload.contact ?? array(created.payload)[0] ?? created);
    contactId = numericId(contact.id);
    sourceId = String(
      record(payload.contact_inbox).source_id ?? contact.source_id ?? "",
    );
  }
  if (!contactId) {
    throw new Error("Chatwoot did not return a contact id");
  }

  const conversations = await chatwootRequest(
    config,
    `/api/v1/accounts/${config.accountId}/contacts/${contactId}/conversations`,
  );
  const conversationRows = array(conversations.payload);
  let conversation = conversationRows.find(
    (item) =>
      numericId(item.inbox_id) === config.inboxId &&
      ["open", "pending"].includes(String(item.status)),
  );
  let conversationId = numericId(conversation?.id);

  if (!conversationId) {
    const createdConversation = await chatwootRequest(
      config,
      `/api/v1/accounts/${config.accountId}/conversations`,
      {
        method: "POST",
        body: JSON.stringify({
          source_id: sourceId || `${input.tenantId}:${input.phone}`,
          inbox_id: config.inboxId,
          contact_id: contactId,
          status: "open",
          custom_attributes: { tenant_id: input.tenantId },
        }),
      },
    );
    conversation = record(createdConversation);
    conversationId = numericId(conversation.id);
  }
  if (!conversationId) {
    throw new Error("Chatwoot did not return a conversation id");
  }

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
          tenant_id: input.tenantId,
        },
      }),
    },
  );

  await prisma.whatsappConversationSession.update({
    where: {
      tenantId_phone: {
        tenantId: input.tenantId,
        phone: input.phone,
      },
    },
    data: {
      chatwootContactId: String(contactId),
      chatwootConversationId: String(conversationId),
    },
  });
  return { configured: true, contactId, conversationId };
}

export async function getChatwootWebhookSecret(
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
  return { connection, secret: config.webhookSecret };
}
