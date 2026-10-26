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
