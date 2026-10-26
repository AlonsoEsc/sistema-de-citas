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
  "Subscription",
  "Payment",
  "Invitation",
  "AuditLog",
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

/** Rol de base de datos con RLS (ver migracion row_level_security). */
export const TENANT_DB_ROLE = "citas_app";

/**
 * Filtro de aplicacion: agrega `tenantId` a lecturas y escrituras de TENANT_SCOPED_MODELS.
 * Evita que un olvido de `where: { tenantId }` exponga datos de otro negocio.
 */
function withTenantFilter(prisma: PrismaClient, tenantId: string) {
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

type FilteredClient = ReturnType<typeof withTenantFilter>;

/** Fija rol y negocio para el resto de la transaccion actual (SET LOCAL). */
function setTenantContext(
  client: Pick<FilteredClient, "$executeRaw">,
  tenantId: string,
) {
  return client.$executeRaw`SELECT set_config('role', ${TENANT_DB_ROLE}, true), set_config('app.tenant_id', ${tenantId}, true)`;
}

/**
 * Cliente de Prisma de un negocio con dos barreras:
 * 1. Filtro de aplicacion (withTenantFilter).
 * 2. Row Level Security de PostgreSQL: cada consulta corre en una transaccion con el rol
 *    `citas_app` y `app.tenant_id` fijados, asi la base rechaza filas de otro negocio
 *    aunque el filtro tuviera un error.
 *
 * Las transacciones interactivas fijan el contexto una vez al inicio.
 */
export function forTenant(prisma: PrismaClient, tenantId: string) {
  const filtered = withTenantFilter(prisma, tenantId);
  const guarded = filtered.$extends({
    name: "tenant-rls",
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await filtered.$transaction([
            setTenantContext(filtered, tenantId),
            query(args),
          ]);
          return result;
        },
      },
    },
  });

  type Guarded = typeof guarded;
  const transaction: Guarded["$transaction"] = ((
    work: unknown,
    options?: Parameters<FilteredClient["$transaction"]>[1],
  ) => {
    if (typeof work !== "function") {
      throw new Error(
        "Usa transacciones interactivas con el cliente de un negocio",
      );
    }
    return filtered.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      return (work as (client: typeof tx) => Promise<unknown>)(tx);
    }, options);
  }) as Guarded["$transaction"];

  return new Proxy(guarded, {
    get(target, property, receiver) {
      return property === "$transaction"
        ? transaction
        : Reflect.get(target, property, receiver);
    },
  });
}

export type TenantDb = ReturnType<typeof forTenant>;

/**
 * Cliente filtrado por tenant dentro de una transaccion interactiva. Un TenantDb tambien es
 * asignable a este tipo, asi que las funciones que reciben TenantTx sirven en ambos casos.
 */
export type TenantTx = Omit<TenantDb, ITXClientDenyList>;
