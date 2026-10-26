import { createPrismaClient } from "@citas/db";
import { writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { env, sendMode } from "./config.js";
import { flushMonitoring, initMonitoring, reportError } from "./monitoring.js";
import { processOutbox } from "./outbox/process.js";
import { enqueueScheduledNotifications } from "./scheduler/reminders.js";
import { runScheduledReports } from "./scheduler/scheduled-reports.js";

initMonitoring({
  dsn: env.SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
  release: env.APP_VERSION,
  service: "worker",
});

const prisma = createPrismaClient({ connectionString: env.DATABASE_URL });
const workerId = `${hostname()}:${process.pid}`;
const stop = new AbortController();

async function tick() {
  try {
    await enqueueScheduledNotifications(prisma, {
      pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    });
    await runScheduledReports(prisma);
    await processOutbox(prisma, { workerId, batchSize: env.WORKER_BATCH_SIZE });
    await writeFile(env.WORKER_HEARTBEAT_FILE, new Date().toISOString());
  } catch (error) {
    console.error("[worker] el ciclo fallo", error);
    reportError(error);
  }
}

/** Un ciclo a la vez: el siguiente empieza solo cuando el anterior termino. */
async function run() {
  console.log(`[worker] iniciado id=${workerId} envio=${sendMode}`);
  while (!stop.signal.aborted) {
    await tick();
    await sleep(env.WORKER_POLL_INTERVAL_MS, undefined, {
      signal: stop.signal,
    }).catch(() => undefined);
  }
  await prisma.$disconnect();
  await flushMonitoring();
  console.log("[worker] detenido");
}

// Apagado ordenado: termina el ciclo en curso antes de cerrar la conexion.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => stop.abort());
}

run().catch((error) => {
  console.error("[worker] error fatal", error);
  reportError(error);
  void flushMonitoring().finally(() => process.exit(1));
});
