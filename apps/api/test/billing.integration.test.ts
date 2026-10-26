import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { createPrismaClient } from "@citas/db";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { processInboundWhatsappMessage } from "../src/modules/messaging/assistant/index.js";
import { queueAppointmentNotifications } from "../src/modules/notifications/notification.service.js";
import { loadTenantContext } from "../src/modules/tenancy/tenant-context.js";
import { tenantScope } from "../src/shared/tenant-scope.js";
import { grantSubscription } from "./helpers.js";

const prisma = createPrismaClient();
const tenantId = "b1b1b1b1-0000-4000-8000-0000000000b1";
const tenantSlug = "qa-facturacion";
const ownerEmail = "owner.billing@qa.local";
const password = "Billing1234!";
const DAY_MS = 86_400_000;

let app: FastifyInstance;
let token: string;

async function cleanup() {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { email: ownerEmail } });
}

function adminPost(url: string, payload: object) {
  return app.inject({
    method: "POST",
    url,
    payload,
    headers: { authorization: `Bearer ${token}` },
  });
}

test.before(async () => {
  await cleanup();
  await prisma.tenant.create({
    data: { id: tenantId, name: "Facturacion QA", slug: tenantSlug },
  });
  const owner = await prisma.user.create({
    data: { email: ownerEmail, passwordHash: await bcrypt.hash(password, 4) },
  });
  const role = await prisma.role.create({ data: { tenantId, name: "owner" } });
  await prisma.tenantUser.create({ data: { tenantId, userId: owner.id } });
  await prisma.userRole.create({
    data: { tenantId, userId: owner.id, roleId: role.id },
  });
  await grantSubscription(prisma, tenantId, { planCode: "basico" });

  app = await buildApp();
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: ownerEmail, password, tenantSlug },
  });
  token = login.json().token;
});

test.after(async () => {
  await app.close();
  await cleanup();
  await prisma.$disconnect();
});

test("los planes activos son publicos para la pagina de precios", async () => {
  const response = await app.inject({ method: "GET", url: "/plans" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json().map((plan: { code: string }) => plan.code),
    ["basico", "negocio", "clinica"],
  );
});

test("el plan limita los profesionales activos", async () => {
  const first = await adminPost("/staff", { displayName: "Unico profesional" });
  assert.equal(first.statusCode, 200, first.body);

  const second = await adminPost("/staff", {
    displayName: "Segundo profesional",
  });
  assert.equal(second.statusCode, 403);
  assert.equal(second.json().error, "PLAN_LIMIT_REACHED");

  const inactive = await adminPost("/staff", {
    displayName: "Profesional inactivo",
    active: false,
  });
  assert.equal(
    inactive.statusCode,
    200,
    "un profesional inactivo no ocupa cupo",
  );
});

test("con el cupo de WhatsApp agotado los avisos siguen por correo", async () => {
  const scope = tenantScope(prisma, tenantId);
  const tenant = await loadTenantContext(prisma, tenantId);
  await prisma.notificationOutbox.createMany({
    data: Array.from(
      { length: tenant.limits.whatsappMessagesPerMonth },
      (_, index) => ({
        tenantId,
        channel: "whatsapp" as const,
        eventType: "qa.cupo",
        to: "+50370000000",
        status: "sent" as const,
        payloadJson: { index },
      }),
    ),
  });

  const queued = await queueAppointmentNotifications(
    scope,
    tenant,
    {
      id: "00000000-0000-4000-8000-00000000c0b0",
      startAt: new Date(Date.now() + DAY_MS),
      customer: {
        fullName: "Cliente QA",
        phone: "+50370001111",
        email: "cliente@qa.local",
        whatsappOptOutAt: null,
      },
      staff: { displayName: "Profesional QA" },
    },
    "appointment.created",
  );
  assert.deepEqual(
    queued.map((row) => row.channel),
    ["email"],
  );
  const usage = await app.inject({
    method: "GET",
    url: "/billing/usage",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(usage.json().whatsappMessages.used, 100);
  assert.equal(usage.json().whatsappMessages.included, 100);
});

test("el asistente de WhatsApp solo responde si el plan lo incluye", async () => {
  const result = await processInboundWhatsappMessage(prisma, {
    tenantId,
    provider: "qa",
    externalMessageId: `qa-plan-${Date.now()}`,
    phone: "+50370002222",
    text: "MENU",
    raw: {},
  });
  assert.equal(result.reason, "assistant_disabled");
});

test("con la prueba vencida el panel queda en solo lectura y el portal cerrado", async () => {
  await grantSubscription(prisma, tenantId, {
    planCode: "negocio",
    status: "trialing",
    trialEndsAt: new Date(Date.now() - DAY_MS),
    currentPeriodEnd: null,
  });

  const write = await adminPost("/services", {
    name: "Servicio nuevo",
    durationMinutes: 30,
    priceCents: 1000,
  });
  assert.equal(write.statusCode, 402);
  assert.equal(write.json().error, "SUBSCRIPTION_INACTIVE");

  const read = await app.inject({
    method: "GET",
    url: "/services",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(read.statusCode, 200, "consultar sigue permitido");

  const summary = await app.inject({
    method: "GET",
    url: "/subscription",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.deepEqual(
    [summary.json().state, summary.json().access],
    ["expired", "read_only"],
  );

  const otp = await app.inject({
    method: "POST",
    url: `/public/${tenantSlug}/auth/start`,
    payload: { fullName: "Cliente", phone: "+50370003333" },
  });
  assert.equal(otp.statusCode, 403);
  assert.equal(otp.json().error, "BOOKING_UNAVAILABLE");
});
