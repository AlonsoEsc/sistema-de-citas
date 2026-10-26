/**
 * Crea (o promueve) un administrador de la plataforma.
 *
 *   npm run platform:admin -- --email ops@tudominio.com --name "Operaciones"
 *
 * Si la cuenta no existe se genera una contrasena aleatoria que se muestra una sola vez.
 * Los superadmins no se registran por la web.
 */
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createPrismaClient } from "../src/index";

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  quiet: true,
});

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    "reset-password": { type: "boolean", default: false },
  },
});

const email = values.email?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(
    "Uso: npm run platform:admin -- --email correo@dominio.com [--name Nombre] [--reset-password]",
  );
  process.exit(1);
}

const prisma = createPrismaClient();
const existing = await prisma.user.findUnique({ where: { email } });
const password = randomBytes(18).toString("base64url");
const mustSetPassword = !existing || values["reset-password"];

await prisma.user.upsert({
  where: { email },
  create: {
    email,
    fullName: values.name,
    passwordHash: await bcrypt.hash(password, 10),
    isPlatformAdmin: true,
    emailVerifiedAt: new Date(),
  },
  update: {
    isPlatformAdmin: true,
    isActive: true,
    ...(values["reset-password"]
      ? {
          passwordHash: await bcrypt.hash(password, 10),
          passwordChangedAt: new Date(),
        }
      : {}),
  },
});
await prisma.auditLog.create({
  data: {
    action: "platform.admin_granted",
    entityType: "User",
    metadataJson: { email },
  },
});
await prisma.$disconnect();

console.log(`Administrador de plataforma listo: ${email}`);
if (mustSetPassword) {
  console.log(`Contrasena (se muestra una sola vez): ${password}`);
} else {
  console.log(
    "La cuenta ya existia: conserva su contrasena (usa --reset-password para cambiarla).",
  );
}
