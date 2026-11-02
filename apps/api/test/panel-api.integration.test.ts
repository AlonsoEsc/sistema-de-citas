import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { createPrismaClient } from "@citas/db";
import { addCalendarDays, todayIn, zonedDateTime } from "@citas/shared/time";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { grantSubscription } from "./helpers.js";

const prisma = createPrismaClient();
const tenantId = "5c5c5c5c-0000-4000-8000-000000000007";
const tenantSlug = "qa-panel-api";
const timeZone = "America/El_Salvador";
const ownerEmail = "owner.panel@qa.local";
const password = "Panel1234!";

let app: FastifyInstance;
let adminToken: string;
let staffId: string;
let serviceId: string;

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { email: ownerEmail } });
}

function adminRequest(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) {
  return app.inject({
    method,
    url,
    payload,
    headers: { authorization: `Bearer ${adminToken}` },
  });
}

test.before(async () => {
  await cleanup();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: "Panel QA",
      slug: tenantSlug,
      timezone: timeZone,
      currency: "USD",
      settings: { create: {} },
    },
  });
  await grantSubscription(prisma, tenantId);
  const owner = await prisma.user.create({
    data: { email: ownerEmail, passwordHash: await bcrypt.hash(password, 4) },
  });
  const role = await prisma.role.create({ data: { tenantId, name: "owner" } });
  await prisma.tenantUser.create({ data: { tenantId, userId: owner.id } });
  await prisma.userRole.create({
    data: { tenantId, userId: owner.id, roleId: role.id },
  });

  app = await buildApp();
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: ownerEmail, password, tenantSlug },
  });
  adminToken = login.json().token;

  staffId = (
    await adminRequest("POST", "/staff", {
      displayName: "Profesional Panel",
      commissionType: "percent",
      commissionValue: 40,
    })
  ).json().id;
  serviceId = (
    await adminRequest("POST", "/services", {
      name: "Corte Panel",
      durationMinutes: 30,
      priceCents: 1500,
    })
  ).json().id;
});

test.after(async () => {
  await app.close();
  await cleanup();
  await prisma.$disconnect();
});

async function createAppointment(
  customerId: string,
  day: string,
  time: string,
) {
  const startAt = zonedDateTime(day, time, timeZone);
  return prisma.appointment.create({
    data: {
      tenantId,
      customerId,
      staffId,
      status: "completed",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      priceCents: 1500,
      currency: "USD",
      source: "admin",
      services: {
        create: { serviceId, durationMinutes: 30, priceCents: 1500 },
      },
    },
  });
}

test("borrar un cliente sin citas lo elimina con sus conversaciones", async () => {
  const phone = "+50372220001";
  const customer = await prisma.customer.create({
    data: { tenantId, fullName: "Sin Citas", phone },
  });
  await prisma.whatsappConversationSession.create({
    data: { tenantId, phone },
  });

  const response = await adminRequest("DELETE", `/customers/${customer.id}`);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().anonymized, false);
  assert.equal(await prisma.customer.count({ where: { id: customer.id } }), 0);
  assert.equal(
    await prisma.whatsappConversationSession.count({
      where: { tenantId, phone },
    }),
    0,
  );
  const audit = await prisma.auditLog.findFirst({
    where: { tenantId, entityId: customer.id },
  });
  assert.equal(audit?.action, "customer.deleted");
});

test("borrar un cliente con citas lo anonimiza y conserva el historial", async () => {
  const customer = await prisma.customer.create({
    data: {
      tenantId,
      fullName: "Con Citas",
      phone: "+50372220002",
      email: "con.citas@qa.local",
      notes: "Alergia a un producto",
    },
  });
  const appointment = await createAppointment(
    customer.id,
    addCalendarDays(todayIn(timeZone), -1),
    "10:00",
  );

  const response = await adminRequest("DELETE", `/customers/${customer.id}`);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().anonymized, true);
  const stored = await prisma.customer.findUniqueOrThrow({
    where: { id: customer.id },
  });
  assert.equal(stored.fullName, "Cliente eliminado");
  assert.equal(stored.phone, null);
  assert.equal(stored.email, null);
  assert.equal(stored.notes, null);
  assert.ok(stored.whatsappOptOutAt, "no vuelve a recibir mensajes");
  assert.equal(
    await prisma.appointment.count({ where: { id: appointment.id } }),
    1,
  );

  const missing = await adminRequest("DELETE", `/customers/${tenantId}`);
  assert.equal(missing.statusCode, 404);
});

test("los avisos se pueden desactivar, salvo el codigo de acceso", async () => {
  const reminder = await prisma.notificationTemplate.create({
    data: {
      tenantId,
      channel: "whatsapp",
      eventType: "appointment.reminder",
      body: "Recordatorio {{customerName}}",
    },
  });
  const otp = await prisma.notificationTemplate.create({
    data: {
      tenantId,
      channel: "whatsapp",
      eventType: "auth.otp.requested",
      body: "Tu codigo es {{code}}",
    },
  });

  const off = await adminRequest(
    "PATCH",
    `/notifications/templates/${reminder.id}`,
    { enabled: false },
  );
  assert.equal(off.statusCode, 200);
  assert.equal(off.json().enabled, false);

  const otpOff = await adminRequest(
    "PATCH",
    `/notifications/templates/${otp.id}`,
    { enabled: false },
  );
  assert.equal(otpOff.statusCode, 400);
  assert.equal(otpOff.json().error, "TEMPLATE_REQUIRED");
});

test("el resumen trae citas por dia y por servicio en la zona del negocio", async () => {
  const customer = await prisma.customer.create({
    data: { tenantId, fullName: "Reporte", phone: "+50372220003" },
  });
  const today = todayIn(timeZone);
  // 23:30 en El Salvador ya es el dia siguiente en UTC: debe contar en su dia local.
  await createAppointment(customer.id, today, "08:00");
  await createAppointment(customer.id, today, "23:30");

  const from = zonedDateTime(today, "00:00", timeZone).toISOString();
  const to = zonedDateTime(addCalendarDays(today, 1), "06:00", timeZone);
  const response = await adminRequest(
    "GET",
    `/reports/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to.toISOString())}`,
  );
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.deepEqual(body.byDay, [
    { date: today, appointments: 2, revenueCents: 3000 },
  ]);
  assert.deepEqual(body.byService, [
    {
      serviceId,
      name: "Corte Panel",
      appointments: 2,
      revenueCents: 3000,
    },
  ]);
});

test("la exportacion trae los datos del negocio sin secretos", async () => {
  await prisma.integrationConnection.create({
    data: {
      tenantId,
      provider: "whatsapp",
      scope: "tenant",
      scopeKey: "tenant",
      configEnc: "secreto-cifrado",
    },
  });
  const response = await adminRequest("GET", "/tenants/me/export");
  assert.equal(response.statusCode, 200);
  assert.match(
    String(response.headers["content-disposition"]),
    /attachment; filename="qa-panel-api-/,
  );
  const body = response.json();
  assert.equal(body.tenant.slug, tenantSlug);
  assert.ok(body.customers.length > 0);
  assert.deepEqual(
    body.team.map((member: { email: string }) => member.email),
    [ownerEmail],
  );
  const raw = response.body;
  for (const secret of [
    "passwordHash",
    "configEnc",
    "secreto-cifrado",
    "otpCodeHash",
  ]) {
    assert.ok(
      !raw.includes(secret),
      `la exportacion no debe incluir ${secret}`,
    );
  }
});

test("el cliente puede borrar sus datos desde el portal y su sesion deja de servir", async () => {
  const customer = await prisma.customer.create({
    data: { tenantId, fullName: "Se Borra Solo", phone: "+50372220009" },
  });
  const future = addCalendarDays(todayIn(timeZone), 3);
  const appointment = await createAppointment(customer.id, future, "09:00");
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "confirmed" },
  });
  const token = app.jwt.sign({
    type: "booking_customer",
    customerId: customer.id,
    tenantId,
  });
  const asCustomer = (method: "GET" | "POST", url: string) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` } });

  const deleted = await asCustomer("POST", `/public/${tenantSlug}/me/delete`);
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.json().anonymized, true);

  const stored = await prisma.customer.findUniqueOrThrow({
    where: { id: customer.id },
  });
  assert.equal(stored.phone, null);
  const cancelled = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointment.id },
  });
  assert.equal(cancelled.status, "cancelled", "su cita futura se cancela");

  const after = await asCustomer(
    "GET",
    `/public/${tenantSlug}/my-appointments`,
  );
  assert.equal(after.statusCode, 401);
});

test("la sesion del navegador viaja en una cookie httpOnly con proteccion CSRF", async () => {
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: ownerEmail, password, tenantSlug },
  });
  const setCookie = String(login.headers["set-cookie"]);
  assert.match(setCookie, /^citas_admin=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  const cookie = setCookie.split(";")[0];

  const me = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { cookie },
  });
  assert.equal(me.statusCode, 200);

  const withoutHeader = await app.inject({
    method: "PATCH",
    url: "/tenants/me/settings",
    headers: { cookie },
    payload: { bookingWindowDays: 30 },
  });
  assert.equal(withoutHeader.statusCode, 403);
  assert.equal(withoutHeader.json().error, "CSRF_HEADER_MISSING");

  const withHeader = await app.inject({
    method: "PATCH",
    url: "/tenants/me/settings",
    headers: { cookie, "x-requested-with": "citas" },
    payload: { bookingWindowDays: 30 },
  });
  assert.equal(withHeader.statusCode, 200);

  const logout = await app.inject({
    method: "POST",
    url: "/auth/logout",
    headers: { cookie, "x-requested-with": "citas" },
  });
  assert.match(String(logout.headers["set-cookie"]), /citas_admin=;/);
});

test("la cookie del portal queda limitada a las rutas de su negocio", async () => {
  const customer = await prisma.customer.create({
    data: { tenantId, fullName: "Cookie Portal", phone: "+50372220010" },
  });
  const session = await prisma.customerAuthSession.create({
    data: {
      tenantId,
      provider: "manual",
      fullName: "Cookie Portal",
      phone: "+50372220010",
      otpCodeHash: await bcrypt.hash("123456", 4),
      otpExpiresAt: new Date(Date.now() + 300_000),
    },
  });
  const verify = await app.inject({
    method: "POST",
    url: `/public/${tenantSlug}/auth/verify`,
    payload: { sessionId: session.id, code: "123456" },
  });
  assert.equal(verify.statusCode, 200);
  const setCookie = String(verify.headers["set-cookie"]);
  assert.match(setCookie, new RegExp(`Path=/public/${tenantSlug}`));
  assert.match(setCookie, /HttpOnly/i);

  const mine = await app.inject({
    method: "GET",
    url: `/public/${tenantSlug}/my-appointments`,
    headers: { cookie: setCookie.split(";")[0] },
  });
  assert.equal(mine.statusCode, 200);
  await prisma.customer
    .delete({ where: { id: customer.id } })
    .catch(() => undefined);
});

async function verifiedPortalSession(input: {
  phone: string;
  fullName?: string;
  email?: string;
}) {
  const session = await prisma.customerAuthSession.create({
    data: {
      tenantId,
      provider: "manual",
      fullName: input.fullName ?? "",
      email: input.email,
      phone: input.phone,
      otpCodeHash: await bcrypt.hash("654321", 4),
      otpExpiresAt: new Date(Date.now() + 300_000),
    },
  });
  return app.inject({
    method: "POST",
    url: `/public/${tenantSlug}/auth/verify`,
    payload: { sessionId: session.id, code: "654321" },
  });
}

test("verificar un telefono no permite apropiarse de la ficha de otro por su correo", async () => {
  const victim = await prisma.customer.create({
    data: {
      tenantId,
      fullName: "Victima",
      phone: "+50372220011",
      email: "victima@qa.local",
    },
  });
  const verify = await verifiedPortalSession({
    phone: "+50372220012",
    fullName: "Atacante",
    email: "victima@qa.local",
  });
  assert.equal(verify.statusCode, 200);
  assert.notEqual(verify.json().customer.id, victim.id);
  const untouched = await prisma.customer.findUniqueOrThrow({
    where: { id: victim.id },
  });
  assert.equal(untouched.phone, "+50372220011");
  assert.equal(untouched.fullName, "Victima");
});

test("un cliente que vuelve no reescribe su nombre y uno nuevo lo da despues", async () => {
  await prisma.customer.create({
    data: { tenantId, fullName: "Ya Registrada", phone: "+50372220013" },
  });
  const returning = await verifiedPortalSession({ phone: "+50372220013" });
  assert.equal(returning.json().customer.fullName, "Ya Registrada");
  assert.equal(returning.json().needsName, false);

  const fresh = await verifiedPortalSession({ phone: "+50372220014" });
  assert.equal(fresh.json().needsName, true);
  const cookie = String(fresh.headers["set-cookie"]).split(";")[0];
  const named = await app.inject({
    method: "PATCH",
    url: `/public/${tenantSlug}/me`,
    headers: { cookie, "x-requested-with": "citas" },
    payload: { fullName: "Cliente Nueva" },
  });
  assert.equal(named.statusCode, 200);
  assert.equal(named.json().fullName, "Cliente Nueva");
});

test("la exportacion recorre todas las paginas sin perder ni repetir filas", async () => {
  await prisma.customer.createMany({
    data: Array.from({ length: 1_100 }, (_, index) => ({
      tenantId,
      fullName: `Masivo ${index}`,
    })),
  });
  const total = await prisma.customer.count({ where: { tenantId } });
  const response = await adminRequest("GET", "/tenants/me/export");
  assert.equal(response.statusCode, 200);
  const ids = response.json().customers.map((row: { id: string }) => row.id);
  assert.equal(ids.length, total);
  assert.equal(new Set(ids).size, total);
  await prisma.customer.deleteMany({
    where: { tenantId, fullName: { startsWith: "Masivo " } },
  });
});
