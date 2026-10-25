import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
// Las variables reales del entorno (las del servidor o del proceso) siempre ganan.
// apps/api/.env solo sobrescribe valores que vengan del .env de la raiz.
const processEnvKeys = new Set(Object.keys(process.env));
dotenv.config({ path: resolve(currentDir, "../../../.env") });
const localEnv =
  dotenv.config({ path: resolve(currentDir, "../.env") }).parsed ?? {};
for (const [key, value] of Object.entries(localEnv)) {
  if (value.trim().length > 0 && !processEnvKeys.has(key)) {
    process.env[key] = value;
  }
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(12),
  ENCRYPTION_KEY: z.string().min(32),
  OTP_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(30).default(5),
  BOOKING_JWT_EXPIRES_IN: z.string().default("30d"),
  ADMIN_JWT_EXPIRES_IN: z.string().default("12h"),
  ADMIN_BASE_URL: z.string().url().default("http://localhost:5173"),
  CORS_ORIGINS: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:4000/integrations/google/callback"),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  PUBLIC_BOOKING_BASE_URL: z.string().url().default("http://localhost:5174"),
  API_PUBLIC_BASE_URL: z.string().url().default("http://localhost:4000"),
  DEFAULT_TENANT_ID: z.string().uuid().optional(),
  DEFAULT_TENANT_SLUG: z.string().optional(),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === "production") {
  if (
    env.JWT_SECRET.length < 32 ||
    /changeme|replace_with/i.test(env.JWT_SECRET)
  ) {
    throw new Error(
      "JWT_SECRET inseguro: en produccion usa un valor aleatorio de al menos 32 caracteres",
    );
  }
  if (/replace_with/i.test(env.ENCRYPTION_KEY)) {
    throw new Error("ENCRYPTION_KEY sigue con el valor de ejemplo");
  }
}

export const corsOrigins: true | string[] = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : env.NODE_ENV === "production"
    ? [env.ADMIN_BASE_URL, env.PUBLIC_BOOKING_BASE_URL]
    : true;
