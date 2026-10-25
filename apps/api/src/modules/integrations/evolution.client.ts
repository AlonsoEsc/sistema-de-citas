import type { EvolutionConfig } from "@citas/shared/integrations";
import { badRequest } from "../../shared/errors.js";
import { fetchWithTimeout, readJson } from "../../shared/http-client.js";

/** Eventos de Evolution que la API necesita recibir por webhook. */
export const EVOLUTION_WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "SEND_MESSAGE",
  "CONNECTION_UPDATE",
];

type EvolutionCredentials = Pick<
  EvolutionConfig,
  "baseUrl" | "apiKey" | "instanceName"
>;

function instancePath(config: EvolutionCredentials, path: string) {
  return `${config.baseUrl}/${path}/${encodeURIComponent(config.instanceName)}`;
}

export async function getEvolutionConnectionState(
  config: EvolutionCredentials,
) {
  const response = await fetchWithTimeout(
    instancePath(config, "instance/connectionState"),
    { headers: { apikey: config.apiKey } },
  );
  const body = await readJson<{
    instance?: { state?: string };
    state?: string;
    message?: string;
  }>(response);
  if (!response.ok) {
    throw badRequest(
      `No se pudo consultar la instancia de Evolution: ${body.message ?? response.status}`,
      "EVOLUTION_CONNECTION_FAILED",
    );
  }
  return (body.instance?.state ?? body.state ?? "unknown").toLowerCase();
}

export async function setEvolutionWebhook(
  config: EvolutionCredentials,
  webhookUrl: string,
) {
  const response = await fetchWithTimeout(instancePath(config, "webhook/set"), {
    method: "POST",
    headers: { apikey: config.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        base64: false,
        events: EVOLUTION_WEBHOOK_EVENTS,
      },
    }),
  });
  const body = await readJson<{ message?: string }>(response);
  return response.ok
    ? { ok: true as const }
    : {
        ok: false as const,
        error: `No se pudo configurar el webhook: ${body.message ?? response.status}`,
      };
}

export function isEvolutionConnected(state: string) {
  return ["open", "connected"].includes(state);
}
