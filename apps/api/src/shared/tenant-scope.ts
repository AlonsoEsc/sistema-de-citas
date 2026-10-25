import {
  forTenant,
  type PrismaClient,
  type TenantDb,
  type TenantTx,
} from "@citas/db";
import type { FastifyRequest } from "fastify";
import { unauthorized } from "./errors.js";

/** Acceso a datos de un negocio: todas las consultas de `db` quedan filtradas por tenant. */
export type TenantScope = {
  tenantId: string;
  db: TenantDb;
};

/** Igual que TenantScope pero valido dentro de una transaccion (un TenantScope tambien sirve). */
export type TenantTxScope = {
  tenantId: string;
  db: TenantTx;
};

export function tenantScope(
  prisma: PrismaClient,
  tenantId: string,
): TenantScope {
  return { tenantId, db: forTenant(prisma, tenantId) };
}

/** Scope del negocio de la peticion (lo asignan requireAuth o el resolvedor del portal). */
export function scopeOf(request: FastifyRequest): TenantScope {
  if (!request.scope) {
    throw unauthorized();
  }
  return request.scope;
}
