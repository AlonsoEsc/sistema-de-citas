import rateLimit, { type RateLimitPluginOptions } from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { env } from "../config.js";

/**
 * Limites de intentos por IP. Con REDIS_URL los contadores se comparten entre todas las
 * instancias de la API (si no, cada proceso cuenta por su lado y el limite real se
 * multiplica por el numero de instancias). Sin Redis se cuenta en memoria.
 */
let redis: Redis | undefined;

function sharedRedis() {
  if (env.REDIS_URL && !redis) {
    redis = new Redis(env.REDIS_URL, {
      // Si Redis cae, cada consulta falla en medio segundo y el limite se salta (la API
      // sigue respondiendo) hasta que vuelva. La cola espera la conexion inicial.
      maxRetriesPerRequest: 1,
      commandTimeout: 500,
      connectTimeout: 2_000,
    });
    // Un aviso por caida (no uno por reintento); vuelve a avisar tras reconectar.
    let warned = false;
    redis.on("error", (error: Error) => {
      if (!warned) {
        warned = true;
        console.warn(`[rate-limit] Redis no disponible: ${error.message}`);
      }
    });
    redis.on("ready", () => {
      warned = false;
    });
  }
  return redis;
}

/**
 * Registra un limite en un grupo de rutas. `name` separa los contadores de cada grupo
 * (login, registro, OTP...) para que uno no consuma el cupo de otro.
 */
export function registerRateLimit(
  scope: FastifyInstance,
  name: string,
  options: Pick<RateLimitPluginOptions, "max" | "timeWindow">,
) {
  const store = sharedRedis();
  return scope.register(rateLimit, {
    ...options,
    nameSpace: `citas-rl-${name}-`,
    ...(store ? { redis: store, skipOnError: true } : {}),
  });
}

/** Cierra la conexion compartida al apagar la API. */
export async function closeRateLimitStore() {
  await redis?.quit().catch(() => undefined);
  redis = undefined;
}
