import { timingSafeEqual } from "node:crypto";

/** Compara secretos en tiempo constante (webhooks). */
export function secureEqual(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
