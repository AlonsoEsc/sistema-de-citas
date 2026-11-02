import { Prisma } from "@citas/db";
import { asRecord } from "./json.js";
import { notFound } from "./errors.js";

/** Codigo de error de PostgreSQL que viaja dentro del error de Prisma (adaptador pg). */
export function postgresErrorCode(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return undefined;
  }
  const adapterError = asRecord(asRecord(error.meta).driverAdapterError);
  const code = asRecord(adapterError.cause).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Deadlock (40P01) o conflicto de serializacion (40001): la transaccion fallo por otra
 * concurrente y repetirla es seguro. Pasa, por ejemplo, cuando dos reservas del mismo
 * horario chocan en la restriccion de exclusion al mismo tiempo.
 */
export function isRetryableTransactionError(error: unknown) {
  const code = postgresErrorCode(error);
  return (
    code === "40P01" ||
    code === "40001" ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034")
  );
}

const MAX_TRANSACTION_ATTEMPTS = 3;

/** Ejecuta una transaccion y la repite si fallo por concurrencia. */
export async function retryOnTransactionConflict<T>(
  operation: () => Promise<T>,
) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (
        attempt >= MAX_TRANSACTION_ATTEMPTS ||
        !isRetryableTransactionError(error)
      ) {
        throw error;
      }
    }
  }
}

/**
 * Convierte el "registro no encontrado" de Prisma (P2025) en un 404 con mensaje propio.
 * Con el cliente filtrado por tenant, un registro de otro negocio tambien cae aqui.
 */
export function notFoundIfMissing(message: string, code = "NOT_FOUND") {
  return (error: unknown): never => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw notFound(message, code);
    }
    throw error;
  };
}
