import type { TenantScope } from "../../shared/tenant-scope.js";

export const EXPORT_FORMAT_VERSION = 1;

/** Filas por consulta al exportar colecciones grandes (clientes y citas). */
const EXPORT_PAGE_SIZE = 500;

/** Recorre una tabla por paginas ordenadas por id, sin cargarla entera en memoria. */
async function* paged<T extends { id: string }>(
  fetchPage: (cursor: string | undefined) => Promise<T[]>,
) {
  let cursor: string | undefined;
  for (;;) {
    const rows = await fetchPage(cursor);
    yield* rows;
    if (rows.length < EXPORT_PAGE_SIZE) {
      return;
    }
    cursor = rows[rows.length - 1].id;
  }
}

function pageArgs(cursor: string | undefined) {
  return {
    take: EXPORT_PAGE_SIZE,
    orderBy: { id: "asc" as const },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

async function* jsonArray<T>(rows: AsyncIterable<T>) {
  yield "[";
  let first = true;
  for await (const row of rows) {
    yield `${first ? "" : ","}${JSON.stringify(row)}`;
    first = false;
  }
  yield "]";
}

/**
 * Copia de los datos del negocio (portabilidad) como JSON en flujo: clientes y citas se
 * leen por paginas, asi un negocio grande no carga todo en memoria. Nunca incluye
 * secretos: ni contrasenas, ni credenciales cifradas de integraciones, ni codigos.
 */
export async function* exportTenantJson({ db, tenantId }: TenantScope) {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      industry: true,
      timezone: true,
      currency: true,
      locale: true,
      createdAt: true,
      settings: {
        select: { cancelPolicyMinutes: true, bookingWindowDays: true },
      },
    },
  });
  const header = {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    tenant,
  };
  yield JSON.stringify(header).slice(0, -1);

  const small = {
    staff: await db.staff.findMany({
      select: {
        id: true,
        displayName: true,
        phone: true,
        active: true,
        createdAt: true,
        schedules: {
          select: {
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            breakJson: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    services: await db.service.findMany({
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        priceCents: true,
        active: true,
      },
      orderBy: { name: "asc" },
    }),
    notificationTemplates: await db.notificationTemplate.findMany({
      select: {
        channel: true,
        eventType: true,
        subject: true,
        body: true,
        enabled: true,
      },
    }),
    team: (
      await db.tenantUser.findMany({
        select: {
          status: true,
          user: { select: { email: true, fullName: true } },
        },
      })
    ).map((member) => ({
      email: member.user.email,
      fullName: member.user.fullName,
      status: member.status,
    })),
    scheduledReports: await db.scheduledReport.findMany({
      select: {
        name: true,
        frequency: true,
        recipientsJson: true,
        channel: true,
        enabled: true,
      },
    }),
    payments: await db.payment.findMany({
      select: {
        amountCents: true,
        currency: true,
        method: true,
        reference: true,
        paidAt: true,
        periodStart: true,
        periodEnd: true,
      },
      orderBy: { paidAt: "asc" },
    }),
  };
  for (const [key, value] of Object.entries(small)) {
    yield `,${JSON.stringify(key)}:${JSON.stringify(value)}`;
  }

  yield ',"customers":';
  yield* jsonArray(
    paged((cursor) =>
      db.customer.findMany({
        ...pageArgs(cursor),
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          notes: true,
          whatsappOptInAt: true,
          whatsappOptOutAt: true,
          createdAt: true,
        },
      }),
    ),
  );

  yield ',"appointments":';
  yield* jsonArray(
    paged((cursor) =>
      db.appointment.findMany({
        ...pageArgs(cursor),
        select: {
          id: true,
          customerId: true,
          staffId: true,
          status: true,
          startAt: true,
          endAt: true,
          priceCents: true,
          currency: true,
          source: true,
          createdAt: true,
          services: {
            select: {
              serviceId: true,
              durationMinutes: true,
              priceCents: true,
            },
          },
        },
      }),
    ),
  );
  yield "}";
}
