import { stat } from "node:fs/promises";
import { env } from "./config.js";

/**
 * Healthcheck del contenedor: sano si el worker completo un ciclo hace poco. Un ciclo que
 * falla no toca el latido, asi que una base caida tambien marca el contenedor como enfermo.
 */
const maxAgeMs = Math.max(env.WORKER_POLL_INTERVAL_MS * 4, 60_000);

try {
  const { mtimeMs } = await stat(env.WORKER_HEARTBEAT_FILE);
  const age = Date.now() - mtimeMs;
  if (age > maxAgeMs) {
    console.error(
      `[healthcheck] ultimo ciclo hace ${Math.round(age / 1000)} s`,
    );
    process.exit(1);
  }
} catch {
  console.error("[healthcheck] el worker aun no completa un ciclo");
  process.exit(1);
}
