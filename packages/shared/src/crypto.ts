import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Solo para Node (API y worker). AES-256-GCM con IV aleatorio; formato "iv.tag.cifrado" en base64.
const ALGORITHM = "aes-256-gcm";

function keyFrom(base64Key: string) {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY debe ser base64 de 32 bytes");
  }
  return key;
}

export function encryptSecret(value: string, base64Key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyFrom(base64Key), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64"))
    .join(".");
}

export function decryptSecret(value: string, base64Key: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Formato de secreto cifrado invalido");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    keyFrom(base64Key),
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptJson(value: unknown, base64Key: string) {
  return encryptSecret(JSON.stringify(value), base64Key);
}

export function decryptJson<T>(value: string, base64Key: string): T {
  return JSON.parse(decryptSecret(value, base64Key)) as T;
}
