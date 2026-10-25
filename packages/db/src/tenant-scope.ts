import type { ITXClientDenyList } from "@prisma/client/runtime/client";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

/**
 * Modelos que pertenecen a un tenant (tienen columna `tenantId`). Cualquier modelo nuevo
 * con `tenantId` debe agregarse aqui; el test de tenant-scope falla si se olvida.
 */
export const TENANT_SCOPED_MODELS: ReadonlySet<Prisma.ModelName> = new Set([
  "TenantSetting",
  "TenantUser",
  "Role",
  "UserRole",
  "Staff",
  "StaffSchedule",
  "Service",
  "Customer",
  "Appointment",
  "TenantSubscription",
  "TenantEntitlement",
  "NotificationTemplate",
  "NotificationOutbox",
  "WhatsappMessage",
  "WhatsappConversationSession",
  "AppointmentFeedback",
  "CustomerAuthSession",
  "IntegrationConnection",
  "ScheduledReport",
] satisfies Prisma.ModelName[]);

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

type Row = Record<string, unknown>;

export class CrossTenantWriteError extends Error {
  constructor(model: string) {
    super(
      `Intento de escribir en ${model} con un tenantId distinto al de la sesion`,
    );
    this.name = "CrossTenantWriteError";
  }
}

function withTenantData(model: string, data: unknown, tenantId: string): Row {
  const row = (data ?? {}) as Row;
  if (row.tenantId !== undefined && row.tenantId !== tenantId) {
    throw new CrossTenantWriteError(model);
  }
  return { ...row, tenantId };
}

/**
 * Devuelve un cliente de Prisma que filtra lecturas y fuerza `tenantId` en escrituras para
 * todos los modelos de TENANT_SCOPED_MODELS. Es la barrera que evita que un olvido de
 * `where: { tenantId }` exponga datos de otro negocio.
 */
export function forTenant(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model as Prisma.ModelName)) {
            return query(args);
          }
          const scoped = { ...(args as Row) };

          if (WHERE_OPERATIONS.has(operation)) {
            scoped.where = { ...((scoped.where as Row) ?? {}), tenantId };
          } else if (operation === "create") {
            scoped.data = withTenantData(model, scoped.data, tenantId);
          } else if (
            operation === "createMany" ||
            operation === "createManyAndReturn"
          ) {
            const rows = Array.isArray(scoped.data)
              ? scoped.data
              : [scoped.data];
            scoped.data = rows.map((row) =>
              withTenantData(model, row, tenantId),
            );
          } else if (operation === "upsert") {
            scoped.where = { ...((scoped.where as Row) ?? {}), tenantId };
            scoped.create = withTenantData(model, scoped.create, tenantId);
          }

          return query(scoped as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof forTenant>;

/**
 * Cliente filtrado por tenant dentro de una transaccion interactiva. Un TenantDb tambien es
 * asignable a este tipo, asi que las funciones que reciben TenantTx sirven en ambos casos.
 */
export type TenantTx = Omit<TenantDb, ITXClientDenyList>;
