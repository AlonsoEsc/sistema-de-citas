import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export type CreatePrismaClientOptions = {
  connectionString?: string;
};

export function createPrismaClient(options: CreatePrismaClientOptions = {}) {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL es requerido para conectar a la base de datos",
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
