import type { PrismaClient } from "./generated/prisma/client";
import type { TenantTx } from "./tenant-scope";

/**
 * Mensajes de WhatsApp salientes de un negocio desde una fecha (los fallidos y los omitidos no cuentan).
 * Lo usan la API y el worker para aplicar el cupo mensual del plan.
 */
export function countWhatsappMessagesSince(
  db: PrismaClient | TenantTx,
  tenantId: string,
  since: Date,
) {
  return db.notificationOutbox.count({
    where: {
      tenantId,
      channel: "whatsapp",
      status: { notIn: ["failed", "skipped"] },
      createdAt: { gte: since },
    },
  });
}
