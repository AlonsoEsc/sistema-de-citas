import { createHash, randomBytes } from "node:crypto";

/**
 * Tokens de un solo uso (invitaciones, recuperacion de contrasena, verificacion de correo).
 * Solo se guarda el hash: una copia de la base no permite usar los enlaces enviados.
 */
export function createOneTimeToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashOneTimeToken(token) };
}

export function hashOneTimeToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
