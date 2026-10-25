import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
config({ path: resolve(rootDir, ".env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` no necesita conexion; migrate y seed fallan con un mensaje claro si falta.
    url: process.env.DATABASE_URL ?? "",
  },
});
