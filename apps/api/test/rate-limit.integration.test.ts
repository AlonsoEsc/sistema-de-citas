import assert from "node:assert/strict";
import test from "node:test";
import { Redis } from "ioredis";
import { buildApp } from "../src/app.js";
import { env } from "../src/config.js";

// Necesita un Redis real: se omite si REDIS_URL no esta definido (CI y desarrollo).
test(
  "con Redis, dos instancias de la API comparten el limite de intentos",
  { skip: !env.REDIS_URL && "REDIS_URL no definido" },
  async () => {
    const redis = new Redis(env.REDIS_URL!);
    await redis.flushdb();
    const first = await buildApp();
    const second = await buildApp();
    try {
      const attempt = (app: typeof first) =>
        app.inject({
          method: "POST",
          url: "/platform/auth/login",
          payload: { email: "nadie@qa.local", password: "x" },
          remoteAddress: "203.0.113.7",
        });
      // El limite del login de plataforma es 5 por minuto entre todas las instancias.
      const statuses = [];
      for (let index = 0; index < 6; index += 1) {
        statuses.push(
          (await attempt(index % 2 === 0 ? first : second)).statusCode,
        );
      }
      assert.deepEqual(statuses.slice(0, 5), [401, 401, 401, 401, 401]);
      assert.equal(statuses[5], 429);
    } finally {
      await first.close();
      await second.close();
      await redis.flushdb();
      await redis.quit();
    }
  },
);
