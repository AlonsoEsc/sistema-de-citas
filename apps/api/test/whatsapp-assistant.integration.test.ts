import assert from "node:assert/strict";
import test from "node:test";
import { createPrismaClient } from "@citas/db";
import { processInboundWhatsappMessage } from "../src/services/whatsapp-assistant.js";

const prisma = createPrismaClient();
const tenantId = "11111111-1111-1111-1111-111111111111";
const phone = "+50379990001";
const messageIds = ["qa-menu-1", "qa-stop-1", "qa-ignored-1"];

async function inbound(externalMessageId: string, text: string) {
  return processInboundWhatsappMessage(prisma, {
    tenantId,
    provider: "qa",
    externalMessageId,
    phone,
    text,
    pushName: "Cliente QA",
    raw: { source: "node-test" },
  });
}

test.before(async () => {
  await prisma.customer.deleteMany({ where: { tenantId, phone } });
  await prisma.customer.create({
    data: {
      tenantId,
      fullName: "Cliente QA Automatizado",
      phone,
      whatsappOptInAt: new Date(),
    },
  });
});

test.after(async () => {
  await prisma.notificationOutbox.deleteMany({
    where: { tenantId, idempotencyKey: { contains: ":qa:qa-" } },
  });
  await prisma.whatsappMessage.deleteMany({
    where: { tenantId, provider: "qa", externalMessageId: { in: messageIds } },
  });
  await prisma.whatsappConversationSession.deleteMany({
    where: { tenantId, phone },
  });
  await prisma.customer.deleteMany({
    where: { tenantId, phone },
  });
  await prisma.$disconnect();
});

test("MENU genera una sola respuesta y los reintentos se deduplican", async () => {
  const first = await inbound("qa-menu-1", "MENÚ");
  assert.equal(first.handled, "menu");

  const reply = await prisma.notificationOutbox.findFirst({
    where: {
      tenantId,
      idempotencyKey: { contains: ":qa:qa-menu-1:reply:" },
    },
  });
  assert.ok(reply);
  assert.match(
    String((reply.payloadJson as { message: string }).message),
    /AGENDAR/,
  );

  const duplicate = await inbound("qa-menu-1", "MENÚ");
  assert.equal(duplicate.duplicate, true);
  assert.equal(
    await prisma.notificationOutbox.count({
      where: {
        tenantId,
        idempotencyKey: { contains: ":qa:qa-menu-1:reply:" },
      },
    }),
    1,
  );
});

test("STOP registra opt-out y silencia mensajes posteriores", async () => {
  const stopped = await inbound("qa-stop-1", "STOP");
  assert.equal(stopped.handled, "opt_out");

  const customer = await prisma.customer.findFirstOrThrow({
    where: { tenantId, phone },
  });
  assert.ok(customer.whatsappOptOutAt);

  const ignored = await inbound("qa-ignored-1", "Hola");
  assert.equal(ignored.ignored, true);
  assert.equal(ignored.reason, "opted_out");
});
