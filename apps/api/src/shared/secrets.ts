import {
  decryptJson as decryptJsonWithKey,
  encryptJson as encryptJsonWithKey,
  encryptSecret as encryptSecretWithKey,
} from "@citas/shared/crypto";
import { env } from "../config.js";

export function encryptSecret(value: string) {
  return encryptSecretWithKey(value, env.ENCRYPTION_KEY);
}

export function encryptJson(value: unknown) {
  return encryptJsonWithKey(value, env.ENCRYPTION_KEY);
}

export function decryptJson<T>(value: string): T {
  return decryptJsonWithKey<T>(value, env.ENCRYPTION_KEY);
}
