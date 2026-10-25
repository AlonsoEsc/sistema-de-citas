import { notFoundIfMissing } from "../../shared/prisma-errors.js";
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

export function updateCustomer(
  { db }: TenantScope,
  customerId: string,
  input: Partial<CustomerInput>,
) {
  return db.customer
    .update({ where: { id: customerId }, data: input })
    .catch(notFoundIfMissing("Cliente no encontrado", "CUSTOMER_NOT_FOUND"));
}
