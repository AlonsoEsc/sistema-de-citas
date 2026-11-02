import assert from "node:assert/strict";
import test from "node:test";
import { createPrismaClient } from "@citas/db";
import { processInboundWhatsappMessage } from "../src/modules/messaging/assistant/index.js";
import { grantSubscription } from "./helpers.js";

const prisma = createPrismaClient();
// Negocio propio de la prueba: no depende de los datos del seed.
const tenantId = "c3c3c3c3-0000-4000-8000-000000000014";
const phone = "+50379990001";

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

async function cleanup() {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

test.before(async () => {
  await cleanup();
  await prisma.tenant.create({
    data: { id: tenantId, name: "Asistente QA", slug: "qa-asistente" },
  });
  // El asistente de WhatsApp esta incluido en el plan Clinica.
  await grantSubscription(prisma, tenantId);
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
  await cleanup();
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
