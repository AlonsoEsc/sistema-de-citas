import { createPrismaClient } from "@citas/db";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { env, sendMode } from "./config.js";
import { processOutbox } from "./outbox/process.js";
import { enqueueScheduledNotifications } from "./scheduler/reminders.js";

const prisma = createPrismaClient({ connectionString: env.DATABASE_URL });
const workerId = `${hostname()}:${process.pid}`;
const stop = new AbortController();

async function tick() {
  try {
    await enqueueScheduledNotifications(prisma, {
      pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    });
    await processOutbox(prisma, { workerId, batchSize: env.WORKER_BATCH_SIZE });
  } catch (error) {
    console.error("[worker] el ciclo fallo", error);
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
  console.log("[worker] detenido");
}

// Apagado ordenado: termina el ciclo en curso antes de cerrar la conexion.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => stop.abort());
}

run().catch((error) => {
  console.error("[worker] error fatal", error);
  process.exit(1);
});
