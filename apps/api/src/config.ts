import dotenv from "dotenv";
import type { FastifyServerOptions } from "fastify";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Mensajes de validacion en espanol para toda la API (los ve el usuario final).
z.config(z.locales.es());

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
  // Version desplegada (commit o etiqueta); la imagen Docker la recibe al construirse.
  APP_VERSION: z.string().default("dev"),
  // Detras de un proxy (Caddy) la IP real llega en X-Forwarded-For. Valores: "false", un
  // numero de saltos ("1") o IPs/rangos de confianza separados por comas.
  TRUST_PROXY: z.string().default("false"),
  // Contadores de limites compartidos entre instancias (opcional con una sola instancia).
  REDIS_URL: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  // Reporte de errores (opcional). Sin DSN no se envia nada.
  SENTRY_DSN: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  SENTRY_ENVIRONMENT: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(12),
  ENCRYPTION_KEY: z.string().min(32),
  OTP_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(30).default(5),
  BOOKING_JWT_EXPIRES_IN: z.string().default("30d"),
  PRODUCT_NAME: z.string().trim().min(1).default("Agenda de Citas"),
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
  DEFAULT_TENANT_ID: z.guid().optional(),
  DEFAULT_TENANT_SLUG: z.string().optional(),
  // Documentacion OpenAPI en /docs. Por defecto solo fuera de produccion.
  API_DOCS_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  // Proveedores globales de la plataforma (opcionales; el worker registra en log si faltan).
  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
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

export const isProduction = env.NODE_ENV === "production";

/** Valor de `trustProxy` de Fastify; sin proxy confiable, X-Forwarded-For se ignora. */
export const trustProxy: FastifyServerOptions["trustProxy"] =
  env.TRUST_PROXY === "true"
    ? true
    : env.TRUST_PROXY === "false"
      ? false
      : /^\d+$/.test(env.TRUST_PROXY)
        ? (_address: string, hop: number) => hop < Number(env.TRUST_PROXY)
        : env.TRUST_PROXY.split(",").map((value) => value.trim());

export const apiDocsEnabled =
  process.env.API_DOCS_ENABLED === undefined
    ? !isProduction
    : env.API_DOCS_ENABLED;

export const corsOrigins: true | string[] = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : env.NODE_ENV === "production"
    ? [env.ADMIN_BASE_URL, env.PUBLIC_BOOKING_BASE_URL]
    : true;
