import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createPrismaClient,
  CrossTenantWriteError,
  forTenant,
  Prisma,
  TENANT_DB_ROLE,
  TENANT_SCOPED_MODELS,
} from "@citas/db";
import { postgresErrorCode } from "../src/shared/prisma-errors.js";

const prisma = createPrismaClient();
const tenantA = "a1a1a1a1-0000-4000-8000-000000000001";
const tenantB = "b2b2b2b2-0000-4000-8000-000000000002";

async function cleanup() {
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
}

test.before(async () => {
  await cleanup();
  for (const [id, slug] of [
    [tenantA, "qa-aislamiento-a"],
    [tenantB, "qa-aislamiento-b"],
  ]) {
    await prisma.tenant.create({
      data: {
        id,
        name: slug,
        slug,
        customers: { create: { fullName: `Cliente de ${slug}` } },
      },
    });
  }
});

test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("todo modelo con tenantId esta registrado como modelo del tenant", () => {
  const schema = readFileSync(
    new URL("../../../packages/db/prisma/schema.prisma", import.meta.url),
    "utf8",
  );
  const modelsWithTenantId = [...schema.matchAll(/model (\w+) \{([^}]*)\}/g)]
    .filter(([, , body]) => /^\s+tenantId\s/m.test(body))
    .map(([, name]) => name)
    .sort();

  assert.deepEqual(modelsWithTenantId, [...TENANT_SCOPED_MODELS].sort());
});

test("las lecturas solo devuelven datos del propio negocio", async () => {
  const dbA = forTenant(prisma, tenantA);
  const customerOfB = await prisma.customer.findFirstOrThrow({
    where: { tenantId: tenantB },
  });

  const visible = await dbA.customer.findMany();
  assert.ok(visible.length > 0);
  assert.ok(visible.every((customer) => customer.tenantId === tenantA));
  assert.equal(
    await dbA.customer.findUnique({ where: { id: customerOfB.id } }),
    null,
  );
  assert.equal(await dbA.customer.count({ where: { id: customerOfB.id } }), 0);
});

test("no se puede modificar ni crear datos en otro negocio", async () => {
  const dbA = forTenant(prisma, tenantA);
  const customerOfB = await prisma.customer.findFirstOrThrow({
    where: { tenantId: tenantB },
  });

  await assert.rejects(
    dbA.customer.update({
      where: { id: customerOfB.id },
      data: { fullName: "Modificado desde otro negocio" },
    }),
    (error) =>
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025",
  );
  await assert.rejects(
    dbA.customer.create({ data: { tenantId: tenantB, fullName: "Intruso" } }),
    CrossTenantWriteError,
  );

  const deleted = await dbA.customer.deleteMany({
    where: { id: customerOfB.id },
  });
  assert.equal(deleted.count, 0);
  assert.equal(
    (await prisma.customer.findUniqueOrThrow({ where: { id: customerOfB.id } }))
      .fullName,
    customerOfB.fullName,
  );
});

/**
 * Ejecuta SQL crudo con el rol de RLS y el negocio dado, sin el filtro de Prisma: prueba
 * que la base de datos aisla por si sola.
 */
function asTenantInDatabase<T>(
  tenantId: string | null,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('role', ${TENANT_DB_ROLE}, true)`;
    if (tenantId) {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    }
    return run(tx);
  });
}

test("RLS: la base de datos solo deja ver filas del negocio fijado", async () => {
  const rows = await asTenantInDatabase(
    tenantA,
    (tx) =>
      tx.$queryRaw<
        Array<{ tenantId: string }>
      >`SELECT "tenantId" FROM "Customer"`,
  );
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.tenantId === tenantA));

  const tenants = await asTenantInDatabase(
    tenantA,
    (tx) => tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Tenant"`,
  );
  assert.deepEqual(
    tenants.map((row) => row.id),
    [tenantA],
  );
});

test("RLS: sin negocio fijado no se ve ninguna fila", async () => {
  const rows = await asTenantInDatabase(
    null,
    (tx) =>
      tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM "Customer"`,
  );
  assert.equal(Number(rows[0].count), 0);
});

test("RLS: la base rechaza escribir en otro negocio", async () => {
  const customerOfB = await prisma.customer.findFirstOrThrow({
    where: { tenantId: tenantB },
  });
  const updated = await asTenantInDatabase(
    tenantA,
    (tx) =>
      tx.$executeRaw`UPDATE "Customer" SET "fullName" = 'Intruso' WHERE "id" = ${customerOfB.id}::uuid`,
  );
  assert.equal(updated, 0);

  await assert.rejects(
    asTenantInDatabase(
      tenantA,
      (tx) =>
        tx.$executeRaw`INSERT INTO "Customer" ("id", "tenantId", "fullName") VALUES (gen_random_uuid(), ${tenantB}::uuid, 'Intruso')`,
    ),
    // 42501: la fila viola la politica de RLS.
    (error) => postgresErrorCode(error) === "42501",
  );
});

test("RLS: el cliente de negocio corre con el rol restringido", async () => {
  const dbA = forTenant(prisma, tenantA);
  const [context] = await dbA.$transaction(
    (tx) =>
      tx.$queryRaw<
        Array<{ role: string; tenant: string }>
      >`SELECT current_user AS role, current_setting('app.tenant_id') AS tenant`,
  );
  assert.deepEqual(context, { role: TENANT_DB_ROLE, tenant: tenantA });
});
