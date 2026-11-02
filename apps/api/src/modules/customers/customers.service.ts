import { notFoundIfMissing } from "../../shared/prisma-errors.js";
import { recordAudit } from "../audit/audit.service.js";
import { ACTIVE_APPOINTMENT_STATUSES } from "../scheduling/availability.service.js";
import type { TenantScope } from "../../shared/tenant-scope.js";
import type { CustomerInput } from "./customers.schemas.js";

const SEARCH_LIMIT = 100;

export function searchCustomers({ db }: TenantScope, search?: string) {
  return db.customer.findMany({
    where: search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: SEARCH_LIMIT,
  });
}

export function createCustomer(
  { db, tenantId }: TenantScope,
  input: CustomerInput,
) {
  return db.customer.create({ data: { tenantId, ...input } });
}

const customerNotFound = notFoundIfMissing(
  "Cliente no encontrado",
  "CUSTOMER_NOT_FOUND",
);

export const ANONYMIZED_CUSTOMER_NAME = "Cliente eliminado";

/**
 * Elimina los datos personales de un cliente (derecho de supresion). Si tiene citas, el
 * registro se anonimiza para no romper el historial ni los reportes; si no, se borra.
 * En ambos casos se borran sus conversaciones, sesiones de acceso y avisos pendientes, y
 * sus citas futuras se cancelan (ya no habria a quien atender ni avisar).
 *
 * `actorUserId` es null cuando lo pide el propio cliente desde el portal.
 */
export async function deleteCustomer(
  { db, tenantId }: TenantScope,
  customerId: string,
  actorUserId: string | null,
) {
  const customer = await db.customer
    .findUniqueOrThrow({
      where: { id: customerId },
      include: { _count: { select: { appointments: true } } },
    })
    .catch(customerNotFound);
  const anonymized = customer._count.appointments > 0;
  const contacts = [customer.phone, customer.email].filter(
    (value): value is string => Boolean(value),
  );

  await db.$transaction(async (tx) => {
    if (customer.phone) {
      const phone = customer.phone;
      await tx.whatsappMessage.deleteMany({ where: { phone } });
      await tx.whatsappConversationSession.deleteMany({ where: { phone } });
      await tx.customerAuthSession.deleteMany({ where: { phone } });
    }
    if (contacts.length > 0) {
      await tx.notificationOutbox.deleteMany({
        where: { to: { in: contacts }, status: "pending" },
      });
    }
    await tx.appointment.updateMany({
      where: {
        customerId,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startAt: { gt: new Date() },
      },
      data: { status: "cancelled" },
    });
    if (anonymized) {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          fullName: ANONYMIZED_CUSTOMER_NAME,
          phone: null,
          email: null,
          notes: null,
          whatsappOptInAt: null,
          whatsappOptOutAt: new Date(),
        },
      });
    } else {
      await tx.customer.delete({ where: { id: customerId } });
    }
    await recordAudit(tx, {
      tenantId,
      actorUserId,
      action: anonymized ? "customer.anonymized" : "customer.deleted",
      entityType: "customer",
      entityId: customerId,
      metadata: { requestedBy: actorUserId ? "business" : "customer" },
    });
  });
  return { ok: true as const, deletedId: customerId, anonymized };
}

export function updateCustomer(
  { db }: TenantScope,
  customerId: string,
  input: Partial<CustomerInput>,
) {
  return db.customer
    .update({ where: { id: customerId }, data: input })
    .catch(customerNotFound);
}
