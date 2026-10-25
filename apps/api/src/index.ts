import { buildApp } from "./app.js";
import { env } from "./config.js";

const app = await buildApp();

// Apagado ordenado: deja de aceptar peticiones, termina las activas y cierra la base.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, "Cerrando la API");
    await app.close();
    process.exit(0);
  });
}

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
