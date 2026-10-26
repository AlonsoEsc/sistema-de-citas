import type { NotificationOutbox } from "@citas/db";
import type { RenderedMessage } from "../outbox/render.js";

export type SendResult = {
  provider: string;
  messageId?: string;
  raw?: unknown;
};

export type Delivery = {
  item: NotificationOutbox;
  message: RenderedMessage;
};

const SEND_TIMEOUT_MS = 15_000;

export function postWithTimeout(url: string, init: RequestInit) {
  return fetch(url, {
    ...init,
    method: "POST",
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
}

export async function readBody(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}
