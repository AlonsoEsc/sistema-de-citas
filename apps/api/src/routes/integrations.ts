import type { FastifyInstance } from "fastify";
import { Prisma } from "@citas/db";
import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { IntegrationProvider, IntegrationScope } from "@citas/db";
import { env } from "../config.js";
import { PERMISSIONS, requireAuth, requirePermission } from "../lib/auth.js";
import { encryptJson, encryptSecret } from "../lib/secrets.js";
import { badRequest, notFound } from "../lib/http-error.js";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

const providerSchema = z.enum([
  "google_calendar",
  "whatsapp",
  "email",
  "chatwoot",
]);
const scopeSchema = z.enum(["tenant", "staff"]).default("tenant");
const evolutionConfigSchema = z.object({
  provider: z.literal("evolution").default("evolution"),
  baseUrl: z.string().url(),
  apiKey: z.string().min(8),
  instanceName: z.string().trim().min(1).max(100),
  webhookSecret: z.string().min(16).optional(),
});
const chatwootConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiToken: z.string().min(8),
  accountId: z.coerce.number().int().positive(),
  inboxId: z.coerce.number().int().positive(),
  webhookSecret: z.string().min(16).optional(),
});

function scopeKey(scope: IntegrationScope, staffId?: string) {
  return scope === "staff" ? `staff:${staffId}` : "tenant";
}

function publicConnection(row: {
  id: string;
  provider: IntegrationProvider;
  scope: IntegrationScope;
  scopeKey: string;
  staffId: string | null;
  status: string;
  accountEmail: string | null;
  externalId: string | null;
  metadataJson: unknown;
  lastError: string | null;
  connectedAt: Date | null;
  updatedAt: Date;
}) {
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

function googleConfigured() {
  return Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI,
  );
}

function googleClient() {
  return new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

function toJsonInput(value: Record<string, unknown> | undefined) {
  return value as Prisma.InputJsonValue | undefined;
}

export async function integrationRoutes(app: FastifyInstance) {
  app.get(
    "/integrations",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const rows = await app.prisma.integrationConnection.findMany({
        where: { tenantId: request.tenantId },
        orderBy: [{ provider: "asc" }, { scopeKey: "asc" }],
      });

      return {
        configured: {
          googleCalendar: googleConfigured(),
          whatsapp: Boolean(
            process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN,
          ),
          email: Boolean(
            process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM,
          ),
        },
        connections: rows.map(publicConnection),
      };
    },
  );

  app.get(
    "/integrations/whatsapp/setup",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const connection = await app.prisma.integrationConnection.findUnique({
        where: {
          tenantId_provider_scopeKey: {
            tenantId: request.tenantId as string,
            provider: "whatsapp",
            scopeKey: "tenant",
          },
        },
      });
      const baseWebhookUrl = `${env.API_PUBLIC_BASE_URL.replace(/\/$/, "")}/webhooks/whatsapp/evolution`;
      return {
        connected: connection?.status === "connected",
        status: connection?.status ?? "disconnected",
        connectionId: connection?.id ?? null,
        instanceName: connection?.externalId ?? null,
        provider:
          (connection?.metadataJson as { provider?: string } | null)
            ?.provider ?? null,
        mode:
          (connection?.metadataJson as { mode?: string } | null)?.mode ?? null,
        lastError: connection?.lastError ?? null,
        webhookUrl: connection ? `${baseWebhookUrl}/${connection.id}` : null,
      };
    },
  );

  app.post(
    "/integrations/whatsapp/evolution/connect",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const payload = evolutionConfigSchema.parse(request.body);
      const webhookSecret =
        payload.webhookSecret ?? randomBytes(24).toString("base64url");
      const baseUrl = payload.baseUrl.replace(/\/$/, "");

      const stateResponse = await fetch(
        `${baseUrl}/instance/connectionState/${encodeURIComponent(payload.instanceName)}`,
        { headers: { apikey: payload.apiKey } },
      );
      const stateRaw = (await stateResponse.json().catch(() => ({}))) as {
        instance?: { state?: string };
        state?: string;
        message?: string;
      };
      if (!stateResponse.ok) {
        throw badRequest(
          `No se pudo consultar la instancia de Evolution: ${stateRaw.message ?? stateResponse.status}`,
          "EVOLUTION_CONNECTION_FAILED",
        );
      }

      const existing = await app.prisma.integrationConnection.upsert({
        where: {
          tenantId_provider_scopeKey: {
            tenantId: request.tenantId as string,
            provider: "whatsapp",
            scopeKey: "tenant",
          },
        },
        create: {
          tenantId: request.tenantId as string,
          provider: "whatsapp",
          scope: "tenant",
          scopeKey: "tenant",
          status: "pending",
          externalId: payload.instanceName,
          configEnc: encryptJson({ ...payload, baseUrl, webhookSecret }),
          metadataJson: {
            provider: "evolution",
            mode: "cloud_api_preferred",
            evolutionState:
              stateRaw.instance?.state ?? stateRaw.state ?? "unknown",
          },
        },
        update: {
          status: "pending",
          externalId: payload.instanceName,
          configEnc: encryptJson({ ...payload, baseUrl, webhookSecret }),
          metadataJson: {
            provider: "evolution",
            mode: "cloud_api_preferred",
            evolutionState:
              stateRaw.instance?.state ?? stateRaw.state ?? "unknown",
          },
          lastError: null,
        },
      });

      const webhookUrl = `${env.API_PUBLIC_BASE_URL.replace(/\/$/, "")}/webhooks/whatsapp/evolution/${existing.id}?token=${encodeURIComponent(webhookSecret)}`;
      const webhookResponse = await fetch(
        `${baseUrl}/webhook/set/${encodeURIComponent(payload.instanceName)}`,
        {
          method: "POST",
          headers: {
            apikey: payload.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: false,
              base64: false,
              events: [
                "MESSAGES_UPSERT",
                "MESSAGES_UPDATE",
                "SEND_MESSAGE",
                "CONNECTION_UPDATE",
              ],
            },
          }),
        },
      );
      const webhookRaw = (await webhookResponse.json().catch(() => ({}))) as {
        message?: string;
      };
      const state = stateRaw.instance?.state ?? stateRaw.state ?? "unknown";
      const connected =
        webhookResponse.ok &&
        ["open", "connected"].includes(state.toLowerCase());

      const connection = await app.prisma.integrationConnection.update({
        where: { id: existing.id },
        data: {
          status: connected ? "connected" : "pending",
          connectedAt: connected ? new Date() : null,
          lastError: webhookResponse.ok
            ? null
            : `No se pudo configurar webhook: ${webhookRaw.message ?? webhookResponse.status}`,
          metadataJson: {
            provider: "evolution",
            mode: "cloud_api_preferred",
            evolutionState: state,
            webhookConfigured: webhookResponse.ok,
          },
        },
      });

      return {
        ...publicConnection(connection),
        webhookUrl: webhookUrl.replace(webhookSecret, "***"),
        evolutionState: state,
        webhookConfigured: webhookResponse.ok,
      };
    },
  );

  app.post(
    "/integrations/chatwoot/connect",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const payload = chatwootConfigSchema.parse(request.body);
      const baseUrl = payload.baseUrl.replace(/\/$/, "");
      const probe = await fetch(
        `${baseUrl}/api/v1/accounts/${payload.accountId}/inboxes/${payload.inboxId}`,
        { headers: { api_access_token: payload.apiToken } },
      );
      const probeRaw = (await probe.json().catch(() => ({}))) as {
        name?: string;
        message?: string;
      };
      if (!probe.ok) {
        throw badRequest(
          `No se pudo validar Chatwoot: ${probeRaw.message ?? probe.status}`,
          "CHATWOOT_CONNECTION_FAILED",
        );
      }

      const webhookSecret =
        payload.webhookSecret ?? randomBytes(24).toString("base64url");
      const connection = await app.prisma.integrationConnection.upsert({
        where: {
          tenantId_provider_scopeKey: {
            tenantId: request.tenantId as string,
            provider: "chatwoot",
            scopeKey: "tenant",
          },
        },
        create: {
          tenantId: request.tenantId as string,
          provider: "chatwoot",
          scope: "tenant",
          scopeKey: "tenant",
          status: "connected",
          externalId: String(payload.inboxId),
          configEnc: encryptJson({ ...payload, baseUrl, webhookSecret }),
          metadataJson: { inboxName: probeRaw.name },
          connectedAt: new Date(),
        },
        update: {
          status: "connected",
          externalId: String(payload.inboxId),
          configEnc: encryptJson({ ...payload, baseUrl, webhookSecret }),
          metadataJson: { inboxName: probeRaw.name },
          connectedAt: new Date(),
          lastError: null,
        },
      });
      const webhookUrl = `${env.API_PUBLIC_BASE_URL.replace(/\/$/, "")}/webhooks/chatwoot/${connection.id}?token=${encodeURIComponent(webhookSecret)}`;
      return {
        ...publicConnection(connection),
        webhookUrl,
        instructions:
          "Registra esta URL en Chatwoot con el evento message_created para habilitar respuestas humanas.",
      };
    },
  );

  app.post(
    "/integrations/google/start",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const payload = z
        .object({
          scope: scopeSchema,
          staffId: z.string().uuid().optional(),
        })
        .parse(request.body ?? {});

      if (payload.scope === "staff" && !payload.staffId) {
        throw badRequest(
          "staffId es requerido para integración por profesional",
        );
      }

      if (!googleConfigured()) {
        return {
          ok: false,
          configured: false,
          missing: [
            "GOOGLE_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET",
            "GOOGLE_REDIRECT_URI",
          ],
        };
      }

      const state = await app.jwt.sign(
        {
          type: "google_oauth",
          tenantId: request.tenantId,
          staffId: payload.staffId,
          scope: payload.scope,
          scopeKey: scopeKey(payload.scope, payload.staffId),
        },
        { expiresIn: "10m" },
      );

      const url = googleClient().generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        state,
        scope: [
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/userinfo.email",
        ],
      });

      await app.prisma.integrationConnection.upsert({
        where: {
          tenantId_provider_scopeKey: {
            tenantId: request.tenantId as string,
            provider: "google_calendar",
            scopeKey: scopeKey(payload.scope, payload.staffId),
          },
        },
        create: {
          tenantId: request.tenantId as string,
          staffId: payload.staffId,
          provider: "google_calendar",
          scope: payload.scope,
          scopeKey: scopeKey(payload.scope, payload.staffId),
          status: "pending",
        },
        update: {
          staffId: payload.staffId,
          scope: payload.scope,
          status: "pending",
          lastError: null,
        },
      });

      return { ok: true, configured: true, authUrl: url };
    },
  );

  app.get("/integrations/google/callback", async (request, reply) => {
    const query = z
      .object({
        code: z.string().min(1).optional(),
        state: z.string().min(1).optional(),
        error: z.string().optional(),
      })
      .parse(request.query);

    if (query.error) {
      return reply
        .type("text/html")
        .send(`<p>Google rechazó la conexión: ${escapeHtml(query.error)}</p>`);
    }

    if (!query.code || !query.state) {
      throw badRequest("Faltan code/state de Google OAuth");
    }

    const state = await app.jwt.verify<{
      type: "google_oauth";
      tenantId: string;
      staffId?: string;
      scope: IntegrationScope;
      scopeKey: string;
    }>(query.state);

    if (state.type !== "google_oauth") {
      throw badRequest("State OAuth inválido");
    }

    const client = googleClient();
    const tokenResponse = await client.getToken(query.code);
    client.setCredentials(tokenResponse.tokens);

    let accountEmail: string | undefined;
    if (tokenResponse.tokens.access_token) {
      const userInfo = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${tokenResponse.tokens.access_token}`,
          },
        },
      );
      if (userInfo.ok) {
        const profile = (await userInfo.json()) as {
          email?: string;
          id?: string;
        };
        accountEmail = profile.email;
      }
    }

    const existing = await app.prisma.integrationConnection.findUnique({
      where: {
        tenantId_provider_scopeKey: {
          tenantId: state.tenantId,
          provider: "google_calendar",
          scopeKey: state.scopeKey,
        },
      },
    });

    await app.prisma.integrationConnection.upsert({
      where: {
        tenantId_provider_scopeKey: {
          tenantId: state.tenantId,
          provider: "google_calendar",
          scopeKey: state.scopeKey,
        },
      },
      create: {
        tenantId: state.tenantId,
        staffId: state.staffId,
        provider: "google_calendar",
        scope: state.scope,
        scopeKey: state.scopeKey,
        status: "connected",
        accountEmail,
        accessTokenEnc: tokenResponse.tokens.access_token
          ? encryptSecret(tokenResponse.tokens.access_token)
          : undefined,
        refreshTokenEnc: tokenResponse.tokens.refresh_token
          ? encryptSecret(tokenResponse.tokens.refresh_token)
          : undefined,
        expiresAt: tokenResponse.tokens.expiry_date
          ? new Date(tokenResponse.tokens.expiry_date)
          : undefined,
        metadataJson: { tokenType: tokenResponse.tokens.token_type },
        connectedAt: new Date(),
      },
      update: {
        status: "connected",
        accountEmail,
        accessTokenEnc: tokenResponse.tokens.access_token
          ? encryptSecret(tokenResponse.tokens.access_token)
          : existing?.accessTokenEnc,
        refreshTokenEnc: tokenResponse.tokens.refresh_token
          ? encryptSecret(tokenResponse.tokens.refresh_token)
          : existing?.refreshTokenEnc,
        expiresAt: tokenResponse.tokens.expiry_date
          ? new Date(tokenResponse.tokens.expiry_date)
          : existing?.expiresAt,
        metadataJson: { tokenType: tokenResponse.tokens.token_type },
        lastError: null,
        connectedAt: new Date(),
      },
    });

    return reply.type("text/html").send(`
      <html>
        <body style="font-family: system-ui; padding: 32px;">
          <h2>Google Calendar conectado</h2>
          <p>Ya puedes cerrar esta ventana y volver a ${escapeHtml(env.PRODUCT_NAME)}.</p>
        </body>
      </html>
    `);
  });

  app.post(
    "/integrations/:provider/config",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const params = z
        .object({ provider: providerSchema })
        .parse(request.params);
      const payload = z
        .object({
          scope: scopeSchema,
          staffId: z.string().uuid().optional(),
          status: z
            .enum(["disconnected", "pending", "connected", "error"])
            .default("connected"),
          accountEmail: z.string().email().optional(),
          externalId: z.string().optional(),
          config: z.record(z.string(), z.unknown()).optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(request.body ?? {});

      if (payload.scope === "staff" && !payload.staffId) {
        throw badRequest(
          "staffId es requerido para integración por profesional",
        );
      }

      const row = await app.prisma.integrationConnection.upsert({
        where: {
          tenantId_provider_scopeKey: {
            tenantId: request.tenantId as string,
            provider: params.provider,
            scopeKey: scopeKey(payload.scope, payload.staffId),
          },
        },
        create: {
          tenantId: request.tenantId as string,
          staffId: payload.staffId,
          provider: params.provider,
          scope: payload.scope,
          scopeKey: scopeKey(payload.scope, payload.staffId),
          status: payload.status,
          accountEmail: payload.accountEmail,
          externalId: payload.externalId,
          configEnc: payload.config ? encryptJson(payload.config) : undefined,
          metadataJson: toJsonInput(payload.metadata),
          connectedAt: payload.status === "connected" ? new Date() : undefined,
        },
        update: {
          staffId: payload.staffId,
          scope: payload.scope,
          status: payload.status,
          accountEmail: payload.accountEmail,
          externalId: payload.externalId,
          configEnc: payload.config ? encryptJson(payload.config) : undefined,
          metadataJson: toJsonInput(payload.metadata),
          lastError: null,
          connectedAt: payload.status === "connected" ? new Date() : undefined,
        },
      });

      return publicConnection(row);
    },
  );

  app.post(
    "/integrations/:provider/disconnect",
    {
      preHandler: [requireAuth, requirePermission(PERMISSIONS.settingsManage)],
    },
    async (request) => {
      const params = z
        .object({ provider: providerSchema })
        .parse(request.params);
      const payload = z
        .object({
          scope: scopeSchema,
          staffId: z.string().uuid().optional(),
        })
        .parse(request.body ?? {});

      const existing = await app.prisma.integrationConnection.findUnique({
        where: {
          tenantId_provider_scopeKey: {
            tenantId: request.tenantId as string,
            provider: params.provider,
            scopeKey: scopeKey(payload.scope, payload.staffId),
          },
        },
      });

      if (!existing) {
        throw notFound("Integración no encontrada");
      }

      const row = await app.prisma.integrationConnection.update({
        where: { id: existing.id },
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
      });

      return publicConnection(row);
    },
  );
}
