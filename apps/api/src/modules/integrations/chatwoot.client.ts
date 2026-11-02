import type { ChatwootConfig } from "@citas/shared/integrations";
import { fetchWithTimeout, readJson } from "../../shared/http-client.js";
import type { JsonRecord } from "../../shared/json.js";

export class ChatwootError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`Chatwoot ${status}: ${message}`);
    this.name = "ChatwootError";
  }
}

export async function chatwootRequest(
  config: Pick<ChatwootConfig, "baseUrl" | "apiToken">,
  path: string,
  init: RequestInit = {},
): Promise<JsonRecord> {
  const response = await fetchWithTimeout(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      api_access_token: config.apiToken,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new ChatwootError(
      response.status,
      String(body.message ?? JSON.stringify(body)),
    );
  }
  return body;
}

/** Valida credenciales consultando la bandeja; devuelve su nombre. */
export async function probeChatwootInbox(
  config: Pick<
    ChatwootConfig,
    "baseUrl" | "apiToken" | "accountId" | "inboxId"
  >,
) {
  const inbox = await chatwootRequest(
    config,
    `/api/v1/accounts/${config.accountId}/inboxes/${config.inboxId}`,
  );
  return typeof inbox.name === "string" ? inbox.name : undefined;
}
