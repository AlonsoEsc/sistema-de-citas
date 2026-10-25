import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { createPrismaClient } from "@citas/db";
import { addCalendarDays, todayIn, zonedDateTime } from "@citas/shared/time";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

const prisma = createPrismaClient();
const tenantId = "5c5c5c5c-0000-4000-8000-000000000005";
const tenantSlug = "qa-agenda-portal";
const timeZone = "America/El_Salvador";
const ownerEmail = "owner.agenda@qa.local";
const password = "Agenda1234!";

let app: FastifyInstance;
let adminToken: string;
let staffId: string;
let serviceId: string;
const customerTokens: string[] = [];

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { email: ownerEmail } });
}

function adminRequest(
  method: "GET" | "POST" | "PUT",
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

function book(token: string, startAt: Date) {
  return app.inject({
    method: "POST",
    url: `/public/${tenantSlug}/book`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      staffId,
      serviceIds: [serviceId],
      startAt: startAt.toISOString(),
    },
  });
}

const tomorrow = () => addCalendarDays(todayIn(timeZone), 1);

test.before(async () => {
  await cleanup();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: "Agenda QA",
      slug: tenantSlug,
      timezone: timeZone,
      currency: "USD",
      settings: { create: { cancelPolicyMinutes: 60, bookingWindowDays: 14 } },
    },
  });
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

  const staff = await adminRequest("POST", "/staff", {
    displayName: "Profesional QA",
    phone: "+50370009999",
    commissionType: "percent",
    commissionValue: 40,
  });
  staffId = staff.json().id;
  const service = await adminRequest("POST", "/services", {
    name: "Consulta QA",
    durationMinutes: 30,
    priceCents: 2500,
  });
  serviceId = service.json().id;

  for (let index = 0; index < 3; index += 1) {
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        fullName: `Cliente ${index}`,
        phone: `+5037100000${index}`,
      },
    });
    customerTokens.push(
      app.jwt.sign({
        type: "booking_customer",
        customerId: customer.id,
        tenantId,
      }),
    );
  }
});

test.after(async () => {
  await app.close();
  await cleanup();
  await prisma.$disconnect();
});

test("el horario semanal se reemplaza completo y se valida", async () => {
  const invalid = await adminRequest("PUT", `/staff/${staffId}/schedule`, [
    { dayOfWeek: 1, startTime: "17:00", endTime: "09:00" },
  ]);
  assert.equal(invalid.statusCode, 400);

  const week = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    startTime: "09:00",
    endTime: "17:00",
    breakJson: [{ start: "12:00", end: "13:00" }],
  }));
  const saved = await adminRequest("PUT", `/staff/${staffId}/schedule`, week);
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().length, 7);
});

test("el portal publico no expone datos internos del personal", async () => {
  const response = await app.inject({
    method: "GET",
    url: `/public/${tenantSlug}/staff`,
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), [
    { id: staffId, displayName: "Profesional QA" },
  ]);
});

test("la disponibilidad respeta jornada y descanso en la zona del negocio", async () => {
  const response = await app.inject({
    method: "GET",
    url: `/public/${tenantSlug}/availability?date=${tomorrow()}&serviceIds=${serviceId}&staffId=${staffId}`,
  });
  assert.equal(response.statusCode, 200, response.body);
  const slots = response.json().data[0].slots as Array<{ startAt: string }>;
  const firstSlot = zonedDateTime(tomorrow(), "09:00", timeZone).toISOString();
  const lunch = zonedDateTime(tomorrow(), "12:00", timeZone).toISOString();
  assert.equal(slots[0].startAt, firstSlot);
  assert.ok(!slots.some((slot) => slot.startAt === lunch));
});

test("un cliente solo puede reservar espacios libres dentro de la ventana", async () => {
  const [token] = customerTokens;

  const atNight = await book(
    token,
    zonedDateTime(tomorrow(), "03:00", timeZone),
  );
  assert.equal(atNight.statusCode, 409);
  assert.equal(atNight.json().error, "SLOT_NOT_AVAILABLE");

  const yesterday = addCalendarDays(todayIn(timeZone), -1);
  const past = await book(token, zonedDateTime(yesterday, "10:00", timeZone));
  assert.equal(past.json().error, "OUTSIDE_BOOKING_WINDOW");

  const farAway = addCalendarDays(todayIn(timeZone), 30);
  const tooFar = await book(token, zonedDateTime(farAway, "10:00", timeZone));
  assert.equal(tooFar.json().error, "OUTSIDE_BOOKING_WINDOW");

  const valid = await book(token, zonedDateTime(tomorrow(), "10:00", timeZone));
  assert.equal(valid.statusCode, 200, valid.body);
  assert.equal(valid.json().status, "confirmed");
  assert.equal(valid.json().currency, "USD");
  assert.equal("customer" in valid.json(), false);
});

test("dos reservas simultaneas del mismo horario: una gana y la otra recibe 409", async () => {
  const startAt = zonedDateTime(tomorrow(), "15:00", timeZone);
  const [first, second] = await Promise.all([
    book(customerTokens[1], startAt),
    book(customerTokens[2], startAt),
  ]);
  assert.deepEqual(
    [first.statusCode, second.statusCode].sort(),
    [200, 409],
    `${first.body} | ${second.body}`,
  );
});

test("el personal puede agendar fuera de jornada, pero nunca encima de otra cita", async () => {
  const customer = await prisma.customer.create({
    data: { tenantId, fullName: "Cliente mostrador" },
  });
  const outsideHours = await adminRequest("POST", "/appointments", {
    staffId,
    serviceIds: [serviceId],
    customerId: customer.id,
    startAt: zonedDateTime(tomorrow(), "19:00", timeZone).toISOString(),
  });
  assert.equal(outsideHours.statusCode, 200, outsideHours.body);

  const overlapping = await adminRequest("POST", "/appointments", {
    staffId,
    serviceIds: [serviceId],
    customerId: customer.id,
    startAt: zonedDateTime(tomorrow(), "10:15", timeZone).toISOString(),
  });
  assert.equal(overlapping.statusCode, 409);
  assert.equal(overlapping.json().error, "SCHEDULE_CONFLICT");
});

test("un negocio no puede cambiarse de plan por su cuenta", async () => {
  const response = await adminRequest("POST", "/subscription/upgrade", {
    planCode: "pro",
  });
  assert.equal(response.statusCode, 404);
});
