import type { IntegrationScope, PrismaClient } from "@citas/db";
import type { FastifyInstance } from "fastify";
import { OAuth2Client } from "google-auth-library";
import { env } from "../../config.js";
import { badRequest } from "../../shared/errors.js";
import { fetchWithTimeout, readJson } from "../../shared/http-client.js";
import { encryptSecret } from "../../shared/secrets.js";
import { tenantScope, type TenantScope } from "../../shared/tenant-scope.js";
import { GOOGLE_OAUTH_STATE_TYPE } from "../auth/tokens.js";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
];

type OAuthState = {
  type: typeof GOOGLE_OAUTH_STATE_TYPE;
  tenantId: string;
  staffId?: string;
  scope: IntegrationScope;
  scopeKey: string;
};

export function isGoogleCalendarConfigured() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function oauthClient() {
  return new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

function connectionWhere(tenantId: string, scopeKey: string) {
  return {
    tenantId_provider_scopeKey: {
      tenantId,
      provider: "google_calendar" as const,
      scopeKey,
    },
  };
}

export async function startGoogleOAuth(
  { db, tenantId }: TenantScope,
  jwt: FastifyInstance["jwt"],
  input: { scope: IntegrationScope; staffId?: string; scopeKey: string },
) {
  if (!isGoogleCalendarConfigured()) {
    return {
      ok: false as const,
      configured: false as const,
      missing: [
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GOOGLE_REDIRECT_URI",
      ],
    };
  }
  const state = jwt.sign(
    {
      type: GOOGLE_OAUTH_STATE_TYPE,
      tenantId,
      staffId: input.staffId,
      scope: input.scope,
      scopeKey: input.scopeKey,
    } satisfies OAuthState,
    { expiresIn: "10m" },
  );

  await db.integrationConnection.upsert({
    where: connectionWhere(tenantId, input.scopeKey),
    create: {
      tenantId,
      staffId: input.staffId,
      provider: "google_calendar",
      scope: input.scope,
      scopeKey: input.scopeKey,
      status: "pending",
    },
    update: {
      staffId: input.staffId,
      scope: input.scope,
      status: "pending",
      lastError: null,
    },
  });

  const authUrl = oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    state,
    scope: GOOGLE_SCOPES,
  });
  return { ok: true as const, configured: true as const, authUrl };
}

/** Completa el OAuth de Google y guarda los tokens cifrados. */
export async function completeGoogleOAuth(
  prisma: PrismaClient,
  jwt: FastifyInstance["jwt"],
  input: { code: string; state: string },
) {
  let state: OAuthState;
  try {
    state = jwt.verify<OAuthState>(input.state);
  } catch {
    throw badRequest("El enlace de autorizacion expiro", "OAUTH_STATE_INVALID");
  }
  if (state.type !== GOOGLE_OAUTH_STATE_TYPE) {
    throw badRequest("State OAuth invalido", "OAUTH_STATE_INVALID");
  }

  const client = oauthClient();
  const { tokens } = await client.getToken(input.code);
  let accountEmail: string | undefined;
  if (tokens.access_token) {
    const response = await fetchWithTimeout(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (response.ok) {
      accountEmail = (await readJson<{ email?: string }>(response)).email;
    }
  }

  const { db, tenantId } = tenantScope(prisma, state.tenantId);
  const encryptedTokens = {
    ...(tokens.access_token
      ? { accessTokenEnc: encryptSecret(tokens.access_token) }
      : {}),
    ...(tokens.refresh_token
      ? { refreshTokenEnc: encryptSecret(tokens.refresh_token) }
      : {}),
    ...(tokens.expiry_date ? { expiresAt: new Date(tokens.expiry_date) } : {}),
  };
  const data = {
    status: "connected" as const,
    accountEmail,
    metadataJson: { tokenType: tokens.token_type },
    connectedAt: new Date(),
    ...encryptedTokens,
  };
  await db.integrationConnection.upsert({
    where: connectionWhere(tenantId, state.scopeKey),
    create: {
      tenantId,
      staffId: state.staffId,
      provider: "google_calendar",
      scope: state.scope,
      scopeKey: state.scopeKey,
      ...data,
    },
    update: { ...data, lastError: null },
  });
}
