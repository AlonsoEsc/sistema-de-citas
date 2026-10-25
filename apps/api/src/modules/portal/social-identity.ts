import { OAuth2Client } from "google-auth-library";
import { env } from "../../config.js";
import { badRequest } from "../../shared/errors.js";

export type SocialProfile = {
  providerUserId: string;
  fullName: string;
  email?: string;
};

const googleClient = env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(env.GOOGLE_CLIENT_ID)
  : null;

export async function resolveGoogleProfile(
  idToken: string,
): Promise<SocialProfile> {
  if (!googleClient) {
    throw badRequest(
      "El acceso con Google no esta configurado",
      "GOOGLE_NOT_CONFIGURED",
    );
  }
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.name) {
    throw badRequest(
      "No se pudo validar la cuenta de Google",
      "GOOGLE_PROFILE_INVALID",
    );
  }
  return {
    providerUserId: payload.sub,
    fullName: payload.name,
    email: payload.email ?? undefined,
  };
}

export async function resolveFacebookProfile(
  accessToken: string,
): Promise<SocialProfile> {
  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET) {
    throw badRequest(
      "El acceso con Facebook no esta configurado",
      "FACEBOOK_NOT_CONFIGURED",
    );
  }

  const debugUrl = new URL("https://graph.facebook.com/debug_token");
  debugUrl.searchParams.set("input_token", accessToken);
  debugUrl.searchParams.set(
    "access_token",
    `${env.FACEBOOK_APP_ID}|${env.FACEBOOK_APP_SECRET}`,
  );
  const debugResponse = await fetch(debugUrl);
  const debug = (await debugResponse.json().catch(() => ({}))) as {
    data?: { app_id?: string; is_valid?: boolean };
  };
  if (
    !debugResponse.ok ||
    !debug.data?.is_valid ||
    debug.data.app_id !== env.FACEBOOK_APP_ID
  ) {
    throw badRequest(
      "Token de Facebook invalido o expirado",
      "FACEBOOK_TOKEN_INVALID",
    );
  }

  const meUrl = new URL("https://graph.facebook.com/me");
  meUrl.searchParams.set("fields", "id,name,email");
  meUrl.searchParams.set("access_token", accessToken);
  const meResponse = await fetch(meUrl);
  const me = (await meResponse.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    email?: string;
  };
  if (!meResponse.ok || !me.id || !me.name) {
    throw badRequest(
      "No se pudo obtener el perfil de Facebook",
      "FACEBOOK_PROFILE_INVALID",
    );
  }
  return { providerUserId: me.id, fullName: me.name, email: me.email };
}
