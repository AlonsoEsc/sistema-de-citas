export * from "./generated/prisma/client";
export { createPrismaClient, type CreatePrismaClientOptions } from "./client";
export {
  CrossTenantWriteError,
  forTenant,
  TENANT_SCOPED_MODELS,
  type TenantDb,
} from "./tenant-scope";
