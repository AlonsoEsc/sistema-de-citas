import type { Prisma } from "@citas/db";

export type JsonRecord = Record<string, unknown>;

/** Devuelve el valor como objeto plano, o un objeto vacio si no lo es. */
export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function toJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}
