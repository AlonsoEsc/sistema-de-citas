import assert from "node:assert/strict";
import test from "node:test";
import { createPrismaClient } from "@citas/db";
import { normalizePhone } from "@citas/shared/phone";
import {
  enabledNotificationChannels,
  queueWhatsappReply,
} from "../src/modules/notifications/notification.service.js";
import { tenantScope } from "../src/shared/tenant-scope.js";

const prisma = createPrismaClient();
const tenantId = "11111111-1111-1111-1111-111111111111";
const scope = tenantScope(prisma, tenantId);
const testKeys: string[] = [];

test.after(async () => {
  if (testKeys.length) {
    await prisma.notificationOutbox.deleteMany({
      where: { idempotencyKey: { in: testKeys } },
    });
  }
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
  testKeys.push(key);
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
