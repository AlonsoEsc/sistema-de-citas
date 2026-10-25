import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
// Las variables reales del entorno ganan; apps/worker/.env solo completa al .env de la raiz.
const processEnvKeys = new Set(Object.keys(process.env));
dotenv.config({ path: resolve(currentDir, "../../../.env"), quiet: true });
const localEnv =
  dotenv.config({ path: resolve(currentDir, "../.env"), quiet: true }).parsed ??
  {};
for (const [key, value] of Object.entries(localEnv)) {
  if (value.trim() && !processEnvKeys.has(key)) {
    process.env[key] = value;
  }
}

const optional = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(32),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(15_000),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(25),
  // "log" no contacta proveedores: evita enviar mensajes reales desde desarrollo o pruebas.
  WORKER_SEND_MODE: z.enum(["live", "log"]).optional(),
  SENDGRID_API_KEY: optional,
  EMAIL_FROM: optional,
  EMAIL_FROM_NAME: z.string().default("Agenda de Citas"),
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_SMS_FROM: optional,
  TWILIO_WHATSAPP_FROM: optional,
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";
export const sendMode = env.WORKER_SEND_MODE ?? (isProduction ? "live" : "log");
