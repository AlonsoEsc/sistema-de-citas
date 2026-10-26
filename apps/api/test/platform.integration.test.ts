import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { createPrismaClient } from "@citas/db";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { nextBillingPeriod } from "../src/modules/billing/billing-period.js";
import { grantSubscription } from "./helpers.js";

const prisma = createPrismaClient();
const tenantId = "c3c3c3c3-0000-4000-8000-0000000000c3";
const tenantSlug = "qa-plataforma";
const platformEmail = "ops@qa-plataforma.local";
const ownerEmail = "owner@qa-plataforma.local";
const password = "Plataforma2030";
const DAY_MS = 86_400_000;

let app: FastifyInstance;
let platformToken: string;
let ownerToken: string;

async function cleanup() {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({
    where: { email: { in: [platformEmail, ownerEmail] } },
  });
}

function asPlatform(
  method: "GET" | "POST" | "PATCH",
  url: string,
  payload?: object,
) {
  return app.inject({
    method,
    url,
    payload,
    headers: { authorization: `Bearer ${platformToken}` },
  });
}

test.before(async () => {
  await cleanup();
  const passwordHash = await bcrypt.hash(password, 4);
  await prisma.user.create({
    data: { email: platformEmail, passwordHash, isPlatformAdmin: true },
  });
  await prisma.tenant.create({
    data: { id: tenantId, name: "Plataforma QA", slug: tenantSlug },
  });
  const owner = await prisma.user.create({
    data: { email: ownerEmail, passwordHash },
  });
  const role = await prisma.role.create({ data: { tenantId, name: "owner" } });
  await prisma.tenantUser.create({ data: { tenantId, userId: owner.id } });
  await prisma.userRole.create({
    data: { tenantId, userId: owner.id, roleId: role.id },
  });
  // Prueba vencida: el negocio esta en solo lectura hasta que pague.
  await grantSubscription(prisma, tenantId, {
    planCode: "negocio",
    status: "trialing",
    trialEndsAt: new Date(Date.now() - DAY_MS),
    currentPeriodEnd: null,
  });

  app = await buildApp();
  platformToken = (
    await app.inject({
      method: "POST",
      url: "/platform/auth/login",
      payload: { email: platformEmail, password },
    })
  ).json().token;
  ownerToken = (
    await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: ownerEmail, password, tenantSlug },
    })
  ).json().token;
});

test.after(async () => {
  await app.close();
  await cleanup();
  await prisma.$disconnect();
});

test("un pago adelantado se suma al final del periodo vigente", () => {
  const paidAt = new Date("2030-03-10T00:00:00Z");
  const active = nextBillingPeriod(
    { status: "active", currentPeriodEnd: new Date("2030-03-20T00:00:00Z") },
    1,
    paidAt,
  );
  assert.equal(active.periodStart.toISOString(), "2030-03-20T00:00:00.000Z");
  assert.equal(active.periodEnd.toISOString(), "2030-04-20T00:00:00.000Z");

  const expired = nextBillingPeriod(
    { status: "active", currentPeriodEnd: new Date("2030-02-01T00:00:00Z") },
    3,
    paidAt,
  );
  assert.equal(expired.periodStart.toISOString(), paidAt.toISOString());
  assert.equal(expired.periodEnd.toISOString(), "2030-06-10T00:00:00.000Z");
});

test("las sesiones de plataforma y de negocio no se mezclan", async () => {
  const ownerOnPlatform = await app.inject({
    method: "GET",
    url: "/platform/tenants",
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(ownerOnPlatform.statusCode, 401);

  const platformOnTenant = await asPlatform("GET", "/staff");
  assert.equal(platformOnTenant.statusCode, 401);

  const notAdmin = await app.inject({
    method: "POST",
    url: "/platform/auth/login",
    payload: { email: ownerEmail, password },
  });
  assert.equal(
    notAdmin.statusCode,
    401,
    "un dueno de negocio no es superadmin",
  );
});

test("registrar un pago reactiva un negocio con la prueba vencida", async () => {
  const blocked = await app.inject({
    method: "POST",
    url: "/services",
    payload: { name: "Servicio", durationMinutes: 30, priceCents: 1000 },
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(blocked.statusCode, 402);

  const list = await asPlatform(
    "GET",
    `/platform/tenants?search=${tenantSlug}`,
  );
  assert.equal(list.json().items[0].subscription.state, "expired");

  const payment = await asPlatform(
    "POST",
    `/platform/tenants/${tenantId}/payments`,
    {
      amountCents: 3900,
      method: "transfer",
      reference: "TRX-QA-001",
      months: 1,
    },
  );
  assert.equal(payment.statusCode, 201, payment.body);

  const detail = (
    await asPlatform("GET", `/platform/tenants/${tenantId}`)
  ).json();
  assert.deepEqual(
    [detail.subscription.state, detail.subscription.access],
    ["active", "full"],
  );
  assert.equal(detail.payments.length, 1);
  assert.equal(detail.payments[0].recordedBy, platformEmail);
  assert.ok(
    detail.auditLog.some(
      (entry: { action: string }) =>
        entry.action === "billing.payment_recorded",
    ),
  );

  const allowed = await app.inject({
    method: "POST",
    url: "/services",
    payload: { name: "Servicio", durationMinutes: 30, priceCents: 1000 },
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(allowed.statusCode, 200, allowed.body);
});

test("cambiar de plan aplica sus limites", async () => {
  const changed = await asPlatform(
    "PATCH",
    `/platform/tenants/${tenantId}/subscription`,
    { planCode: "clinica" },
  );
  assert.equal(changed.json().plan, "clinica");
  const me = await app.inject({
    method: "GET",
    url: "/tenants/me",
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(me.json().limits.maxStaff, 15);
});

test("suspender un negocio bloquea el panel y oculta su portal", async () => {
  const suspended = await asPlatform(
    "POST",
    `/platform/tenants/${tenantId}/status`,
    {
      suspended: true,
      reason: "Prueba QA",
    },
  );
  assert.equal(suspended.json().status, "suspended");

  const write = await app.inject({
    method: "POST",
    url: "/services",
    payload: { name: "Otro", durationMinutes: 30, priceCents: 1000 },
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(write.json().error, "ACCOUNT_SUSPENDED");

  const portal = await app.inject({
    method: "GET",
    url: `/public/${tenantSlug}/services`,
  });
  assert.equal(portal.statusCode, 404);

  await asPlatform("POST", `/platform/tenants/${tenantId}/status`, {
    suspended: false,
  });
  const reopened = await app.inject({
    method: "GET",
    url: `/public/${tenantSlug}/services`,
  });
  assert.equal(reopened.statusCode, 200);
});
