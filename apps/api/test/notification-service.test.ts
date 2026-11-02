import assert from "node:assert/strict";
import test from "node:test";
import { createPrismaClient } from "@citas/db";
import { normalizePhone } from "@citas/shared/phone";
import {
  enabledNotificationChannels,
  queueWhatsappReply,
} from "../src/modules/notifications/notification.service.js";
import { tenantScope } from "../src/shared/tenant-scope.js";
import { grantSubscription } from "./helpers.js";

const prisma = createPrismaClient();
// Negocio propio de la prueba: no depende de los datos del seed.
const tenantId = "c3c3c3c3-0000-4000-8000-000000000013";
const scope = tenantScope(prisma, tenantId);

async function cleanup() {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

test.before(async () => {
  await cleanup();
  await prisma.tenant.create({
    data: { id: tenantId, name: "Avisos QA", slug: "qa-avisos" },
  });
  // El plan Clinica incluye avisos por correo y por WhatsApp.
  await grantSubscription(prisma, tenantId);
});

test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("normaliza números telefónicos sin perder el prefijo internacional", () => {
  assert.equal(normalizePhone("+503 7000-1234"), "+50370001234");
  assert.equal(normalizePhone("503-7000-1234"), "+50370001234");
  assert.equal(normalizePhone(""), "");
});

test("respeta opt-out al seleccionar canales habilitados", async () => {
  const enabled = await enabledNotificationChannels(scope, {
    phone: "+50370001234",
    email: "qa@example.com",
    whatsappOptOutAt: null,
  });
  assert.ok(enabled.includes("whatsapp"));
  assert.ok(enabled.includes("email"));

  const optedOut = await enabledNotificationChannels(scope, {
    phone: "+50370001234",
    email: "qa@example.com",
    whatsappOptOutAt: new Date(),
  });
  assert.ok(!optedOut.includes("whatsapp"));
});

test("la cola de WhatsApp es idempotente", async () => {
  const key = `${tenantId}:qa:notification-idempotency`;
  const input = {
    phone: "503 7000-1234",
    message: "Mensaje QA",
    idempotencyKey: key,
  };

  const first = await queueWhatsappReply(scope, input);
  const second = await queueWhatsappReply(scope, input);

  assert.equal(first.id, second.id);
  assert.equal(first.to, "+50370001234");
  assert.equal(
    await prisma.notificationOutbox.count({ where: { idempotencyKey: key } }),
    1,
  );
});
