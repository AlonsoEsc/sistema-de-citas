import { buildApp } from "./app.js";
import { env } from "./config.js";

async function start() {
  const app = await buildApp();
  await app.listen({
    port: env.PORT,
    host: "0.0.0.0",
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
