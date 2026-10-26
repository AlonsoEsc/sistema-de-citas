import type { Prisma, TenantTx } from "@citas/db";
import { toJsonValue } from "../../shared/json.js";

export type AuditEntry = {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
};

/**
 * Registra una accion relevante (seguridad, facturacion, equipo, configuracion). Nunca
 * guardar secretos ni contrasenas en `metadata`.
 */
/** Cualquier cliente que pueda escribir la bitacora (global, transaccion o de un negocio). */
type AuditWriter =
  | Pick<Prisma.TransactionClient, "auditLog">
  | Pick<TenantTx, "auditLog">;

export function recordAudit(db: AuditWriter, entry: AuditEntry) {
  return db.auditLog.create({
    data: {
      tenantId: entry.tenantId ?? null,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadataJson: entry.metadata ? toJsonValue(entry.metadata) : undefined,
      ip: entry.ip,
    },
  });
}
