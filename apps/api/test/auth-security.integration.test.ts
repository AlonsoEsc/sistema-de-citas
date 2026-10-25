import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { createPrismaClient } from "@citas/db";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

const prisma = createPrismaClient();
const tenantId = "88888888-8888-4888-8888-888888888888";
const tenantSlug = "agenda-qa-security";
const ownerEmail = "owner.security@qa.local";
const staffEmail = "staff.security@qa.local";
const password = "Seguridad1234!";
const otpPhone = "+50379990000";

let app: FastifyInstance;

async function cleanup() {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({
    where: { email: { in: [ownerEmail, staffEmail] } },
  });
}

async function login(email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password, tenantSlug },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json() as {
    token: string;
    user: { permissions: string[] };
  };
}

function get(url: string, token: string) {
  return app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${token}` },
  });
}

test.before(async () => {
  await cleanup();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: "Agenda QA Seguridad",
      slug: tenantSlug,
      entitlements: {
        create: {
          key: "notifications.sms.enabled",
          valueJson: { enabled: true },
        },
      },
    },
  });

  const appointmentsPermission = await prisma.permission.upsert({
    where: { key: "appointments.manage" },
    create: { key: "appointments.manage" },
    update: {},
  });
  const [ownerRole, staffRole] = await Promise.all([
    prisma.role.create({ data: { tenantId, name: "owner" } }),
    prisma.role.create({
      data: {
        tenantId,
        name: "staff",
        permissions: { create: { permissionId: appointmentsPermission.id } },
      },
    }),
  ]);

  const passwordHash = await bcrypt.hash(password, 10);
  for (const [email, roleId] of [
    [ownerEmail, ownerRole.id],
    [staffEmail, staffRole.id],
  ] as const) {
    const user = await prisma.user.create({ data: { email, passwordHash } });
    await prisma.tenantUser.create({ data: { tenantId, userId: user.id } });
    await prisma.userRole.create({
      data: { tenantId, userId: user.id, roleId },
    });
  }

  app = await buildApp();
});

test.after(async () => {
  await app.close();
  await cleanup();
  await prisma.$disconnect();
});

test("un token de cliente del portal no da acceso a la API de administración", async () => {
  const customerToken = await app.jwt.sign({
    type: "booking_customer",
    customerId: "00000000-0000-4000-8000-000000000000",
    tenantId,
  });
  const response = await get("/customers", customerToken);
  assert.equal(response.statusCode, 401);
});

test("el state de Google OAuth y los tokens sin tipo son rechazados", async () => {
  const oauthState = await app.jwt.sign({ type: "google_oauth", tenantId });
  assert.equal((await get("/customers", oauthState)).statusCode, 401);

  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: ownerEmail },
  });
  const legacyToken = await app.jwt.sign({
    userId: owner.id,
    tenantId,
    email: ownerEmail,
  });
  assert.equal((await get("/customers", legacyToken)).statusCode, 401);
});

test("el token de administración caduca", async () => {
  const { token } = await login(ownerEmail);
  const decoded = app.jwt.decode<{ exp?: number }>(token);
  assert.ok(decoded?.exp, "el token debe incluir exp");
});

test("un usuario desactivado pierde el acceso aunque su token siga vigente", async () => {
  const { token } = await login(staffEmail);
  await prisma.user.update({
    where: { email: staffEmail },
    data: { isActive: false },
  });
  try {
    assert.equal((await get("/staff", token)).statusCode, 401);
  } finally {
    await prisma.user.update({
      where: { email: staffEmail },
      data: { isActive: true },
    });
  }
});

test("los permisos por rol se aplican", async () => {
  const owner = await login(ownerEmail);
  const staff = await login(staffEmail);

  assert.ok(owner.user.permissions.includes("settings.manage"));
  assert.deepEqual(staff.user.permissions, ["appointments.manage"]);

  assert.equal((await get("/integrations", owner.token)).statusCode, 200);
  assert.equal((await get("/integrations", staff.token)).statusCode, 403);
  assert.equal((await get("/reports/overview", staff.token)).statusCode, 403);
  assert.equal((await get("/staff", staff.token)).statusCode, 200);

  const createService = await app.inject({
    method: "POST",
    url: "/services",
    headers: { authorization: `Bearer ${staff.token}` },
    payload: { name: "Corte", durationMinutes: 30, priceCents: 1000 },
  });
  assert.equal(createService.statusCode, 403);
});

test("el OTP no se expone fuera de development y se limita por teléfono", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const response = await app.inject({
      method: "POST",
      url: `/public/${tenantSlug}/auth/start`,
      payload: { fullName: "Cliente QA", phone: otpPhone },
    });
    statuses.push(response.statusCode);
    if (response.statusCode === 200) {
      assert.equal(response.json().devOtpCode, undefined);
    }
  }
  assert.deepEqual(statuses, [200, 200, 200, 429]);
});

test("el código OTP no se puede adivinar con intentos ilimitados", async () => {
  await prisma.customerAuthSession.deleteMany({ where: { tenantId } });
  const session = await prisma.customerAuthSession.create({
    data: {
      tenantId,
      provider: "manual",
      fullName: "Cliente QA",
      phone: otpPhone,
      otpCodeHash: await bcrypt.hash("123456", 4),
      otpExpiresAt: new Date(Date.now() + 5 * 60_000),
    },
  });

  const attempts = await Promise.all(
    Array.from({ length: 8 }, () =>
      app.inject({
        method: "POST",
        url: `/public/${tenantSlug}/auth/verify`,
        payload: { sessionId: session.id, code: "000000" },
      }),
    ),
  );
  assert.ok(attempts.every((response) => response.statusCode === 401));

  const stored = await prisma.customerAuthSession.findUniqueOrThrow({
    where: { id: session.id },
  });
  assert.equal(stored.attempts, 5);

  const correct = await app.inject({
    method: "POST",
    url: `/public/${tenantSlug}/auth/verify`,
    payload: { sessionId: session.id, code: "123456" },
  });
  assert.equal(
    correct.statusCode,
    401,
    "tras agotar intentos ni el código correcto sirve",
  );
});
