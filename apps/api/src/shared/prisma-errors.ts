import { Prisma } from "@citas/db";
import { notFound } from "./errors.js";

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
