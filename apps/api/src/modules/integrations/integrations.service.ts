import {
  Prisma,
  type IntegrationConnection,
  type IntegrationProvider,
  type IntegrationScope,
  type IntegrationStatus,
} from "@citas/db";
import type {
  ChatwootConfig,
  EvolutionConfig,
} from "@citas/shared/integrations";
import { randomBytes } from "node:crypto";
import { env } from "../../config.js";
import { badRequest } from "../../shared/errors.js";
import { asRecord, toJsonValue } from "../../shared/json.js";
import { assertSafeOutboundUrl } from "../../shared/outbound-url.js";
import { notFoundIfMissing } from "../../shared/prisma-errors.js";
import { encryptJson } from "../../shared/secrets.js";
import type { TenantScope } from "../../shared/tenant-scope.js";
import { probeChatwootInbox } from "./chatwoot.client.js";
import {
  getEvolutionConnectionState,
  isEvolutionConnected,
  setEvolutionWebhook,
} from "./evolution.client.js";
import { isGoogleCalendarConfigured } from "./google-calendar.js";

const TENANT_SCOPE_KEY = "tenant";

export function scopeKeyFor(scope: IntegrationScope, staffId?: string) {
  return scope === "staff" ? `staff:${staffId}` : TENANT_SCOPE_KEY;
}

function apiUrl(path: string) {
  return `${env.API_PUBLIC_BASE_URL.replace(/\/$/, "")}${path}`;
}

function newWebhookSecret() {
  return randomBytes(24).toString("base64url");
}

/** Vista publica de una conexion: nunca expone tokens ni configuracion cifrada. */
export function publicConnection(row: IntegrationConnection) {
  return {
    id: row.id,
    provider: row.provider,
    scope: row.scope,
    scopeKey: row.scopeKey,
    staffId: row.staffId,
    status: row.status,
    accountEmail: row.accountEmail,
    externalId: row.externalId,
    metadata: row.metadataJson,
    lastError: row.lastError,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function tenantConnectionWhere(
  tenantId: string,
  provider: IntegrationProvider,
  scopeKey = TENANT_SCOPE_KEY,
) {
  return { tenantId_provider_scopeKey: { tenantId, provider, scopeKey } };
}

export async function listIntegrations({ db }: TenantScope) {
  const rows = await db.integrationConnection.findMany({
    orderBy: [{ provider: "asc" }, { scopeKey: "asc" }],
  });
  return {
    configured: {
      googleCalendar: isGoogleCalendarConfigured(),
      whatsapp: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN),
      email: Boolean(env.SENDGRID_API_KEY && env.EMAIL_FROM),
    },
    connections: rows.map(publicConnection),
  };
}

export async function getWhatsappSetup({ db, tenantId }: TenantScope) {
  const connection = await db.integrationConnection.findUnique({
    where: tenantConnectionWhere(tenantId, "whatsapp"),
  });
  const metadata = asRecord(connection?.metadataJson);
  return {
    connected: connection?.status === "connected",
    status: connection?.status ?? "disconnected",
    connectionId: connection?.id ?? null,
    instanceName: connection?.externalId ?? null,
    provider: typeof metadata.provider === "string" ? metadata.provider : null,
    mode: typeof metadata.mode === "string" ? metadata.mode : null,
    lastError: connection?.lastError ?? null,
    webhookUrl: connection
      ? apiUrl(`/webhooks/whatsapp/evolution/${connection.id}`)
      : null,
  };
}

export async function connectEvolution(
  { db, tenantId }: TenantScope,
  input: Omit<EvolutionConfig, "provider" | "webhookSecret"> & {
    webhookSecret?: string;
  },
) {
  const baseUrl = (await assertSafeOutboundUrl(input.baseUrl)).origin;
  const config: EvolutionConfig = {
    provider: "evolution",
    baseUrl,
    apiKey: input.apiKey,
    instanceName: input.instanceName,
    webhookSecret: input.webhookSecret ?? newWebhookSecret(),
  };
  const state = await getEvolutionConnectionState(config);
  const metadata = {
    provider: "evolution",
    mode: "cloud_api_preferred",
    evolutionState: state,
  };

  const pending = await db.integrationConnection.upsert({
    where: tenantConnectionWhere(tenantId, "whatsapp"),
    create: {
      tenantId,
      provider: "whatsapp",
      scope: "tenant",
      scopeKey: TENANT_SCOPE_KEY,
      status: "pending",
      externalId: config.instanceName,
      configEnc: encryptJson(config),
      metadataJson: metadata,
    },
    update: {
      status: "pending",
      externalId: config.instanceName,
      configEnc: encryptJson(config),
      metadataJson: metadata,
      lastError: null,
    },
  });

  const webhookUrl = apiUrl(`/webhooks/whatsapp/evolution/${pending.id}`);
  const webhook = await setEvolutionWebhook(
    config,
    `${webhookUrl}?token=${encodeURIComponent(config.webhookSecret)}`,
  );
  const connected = webhook.ok && isEvolutionConnected(state);
  const connection = await db.integrationConnection.update({
    where: { id: pending.id },
    data: {
      status: connected ? "connected" : "pending",
      connectedAt: connected ? new Date() : null,
      lastError: webhook.ok ? null : webhook.error,
      metadataJson: { ...metadata, webhookConfigured: webhook.ok },
    },
  });

  return {
    ...publicConnection(connection),
    webhookUrl,
    evolutionState: state,
    webhookConfigured: webhook.ok,
  };
}

export async function connectChatwoot(
  { db, tenantId }: TenantScope,
  input: Omit<ChatwootConfig, "webhookSecret"> & { webhookSecret?: string },
) {
  const baseUrl = (await assertSafeOutboundUrl(input.baseUrl)).origin;
  const config: ChatwootConfig = {
    ...input,
    baseUrl,
    webhookSecret: input.webhookSecret ?? newWebhookSecret(),
  };
  const inboxName = await probeChatwootInbox(config).catch((error: Error) => {
    throw badRequest(
      `No se pudo validar Chatwoot: ${error.message}`,
      "CHATWOOT_CONNECTION_FAILED",
    );
  });

  const data = {
    status: "connected" as const,
    externalId: String(config.inboxId),
    configEnc: encryptJson(config),
    metadataJson: { inboxName },
    connectedAt: new Date(),
  };
  const connection = await db.integrationConnection.upsert({
    where: tenantConnectionWhere(tenantId, "chatwoot"),
    create: {
      tenantId,
      provider: "chatwoot",
      scope: "tenant",
      scopeKey: TENANT_SCOPE_KEY,
      ...data,
    },
    update: { ...data, lastError: null },
  });
  return {
    ...publicConnection(connection),
    webhookUrl: `${apiUrl(`/webhooks/chatwoot/${connection.id}`)}?token=${encodeURIComponent(config.webhookSecret)}`,
    instructions:
      "Registra esta URL en Chatwoot con el evento message_created para habilitar respuestas humanas.",
  };
}

/**
 * Guarda estado y metadatos visibles de integraciones sin flujo propio (email, Google
 * Calendar). No acepta secretos ni URLs: WhatsApp y Chatwoot se conectan por sus rutas.
 */
export async function saveIntegrationMetadata(
  { db, tenantId }: TenantScope,
  provider: Extract<IntegrationProvider, "email" | "google_calendar">,
  input: {
    scope: IntegrationScope;
    staffId?: string;
    status: IntegrationStatus;
    accountEmail?: string;
    externalId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  if (input.scope === "staff" && !input.staffId) {
    throw badRequest("staffId es requerido para integraciones por profesional");
  }
  const scopeKey = scopeKeyFor(input.scope, input.staffId);
  const data = {
    staffId: input.staffId,
    scope: input.scope,
    status: input.status,
    accountEmail: input.accountEmail,
    externalId: input.externalId,
    metadataJson: input.metadata ? toJsonValue(input.metadata) : undefined,
    connectedAt: input.status === "connected" ? new Date() : undefined,
  };
  const row = await db.integrationConnection.upsert({
    where: tenantConnectionWhere(tenantId, provider, scopeKey),
    create: { tenantId, provider, scopeKey, ...data },
    update: { ...data, lastError: null },
  });
  return publicConnection(row);
}

export async function disconnectIntegration(
  { db, tenantId }: TenantScope,
  provider: IntegrationProvider,
  input: { scope: IntegrationScope; staffId?: string },
) {
  const row = await db.integrationConnection
    .update({
      where: tenantConnectionWhere(
        tenantId,
        provider,
        scopeKeyFor(input.scope, input.staffId),
      ),
      data: {
        status: "disconnected",
        accountEmail: null,
        externalId: null,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        configEnc: null,
        metadataJson: Prisma.JsonNull,
        lastError: null,
        connectedAt: null,
      },
    })
    .catch(
      notFoundIfMissing("Integracion no encontrada", "INTEGRATION_NOT_FOUND"),
    );
  return publicConnection(row);
}
