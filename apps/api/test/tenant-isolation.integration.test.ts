import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createPrismaClient,
  CrossTenantWriteError,
  forTenant,
  Prisma,
  TENANT_SCOPED_MODELS,
} from "@citas/db";

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
