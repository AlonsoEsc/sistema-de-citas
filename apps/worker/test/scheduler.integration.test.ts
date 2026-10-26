import assert from "node:assert/strict";
import test from "node:test";
import { createPrismaClient } from "@citas/db";
import { enqueueScheduledNotifications } from "../src/scheduler/reminders.js";
import { runScheduledReports } from "../src/scheduler/scheduled-reports.js";

const prisma = createPrismaClient();
const tenantId = "d4d4d4d4-0000-4000-8000-0000000000d4";
const DAY_MS = 86_400_000;

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

async function setPlan(code: string) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code } });
  await prisma.subscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      planId: plan.id,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * DAY_MS),
    },
    update: { planId: plan.id },
  });
  return plan;
}

test.before(async () => {
  await cleanup();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: "Worker QA",
      slug: "qa-worker",
      timezone: "America/El_Salvador",
    },
  });
  await setPlan("basico");
  // Tres citas dentro de la ventana de recordatorio de 24 h (un profesional cada una, para
  // no chocar con la restriccion anti-solapamiento).
  for (let index = 0; index < 3; index += 1) {
    const staff = await prisma.staff.create({
      data: { tenantId, displayName: `Profesional ${index}` },
    });
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        fullName: `Cliente ${index}`,
        phone: `+5037200000${index}`,
      },
    });
    const startAt = new Date(Date.now() + DAY_MS + index * 60_000);
    await prisma.appointment.create({
      data: {
        tenantId,
        customerId: customer.id,
        staffId: staff.id,
        status: "confirmed",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        priceCents: 1500,
        source: "admin",
      },
    });
  }
});

test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("los recordatorios respetan el cupo mensual de WhatsApp del plan", async () => {
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { code: "basico" },
  });
  // Deja un solo mensaje disponible en el mes.
  await prisma.notificationOutbox.createMany({
    data: Array.from({ length: plan.whatsappMessagesPerMonth - 1 }, (_, i) => ({
      tenantId,
      channel: "whatsapp" as const,
      eventType: "qa.cupo",
      to: "+50370000000",
      status: "sent" as const,
      payloadJson: { i },
    })),
  });

  await enqueueScheduledNotifications(prisma, { pollIntervalMs: 15_000 });
  const reminders = await prisma.notificationOutbox.findMany({
    where: { tenantId, eventType: "appointment.reminder_24h" },
  });
  assert.equal(reminders.length, 1, "solo cabe un recordatorio en el cupo");
  const payload = reminders[0].payloadJson as {
    when?: string;
    message?: string;
  };
  assert.ok(
    payload.when && !payload.when.includes("T"),
    "la fecha va formateada",
  );
});

test("un negocio suspendido no envia recordatorios", async () => {
  await prisma.notificationOutbox.deleteMany({
    where: { tenantId, eventType: "appointment.reminder_24h" },
  });
  await prisma.notificationOutbox.deleteMany({
    where: { tenantId, eventType: "qa.cupo" },
  });
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: "suspended" },
  });
  await enqueueScheduledNotifications(prisma, { pollIntervalMs: 15_000 });
  assert.equal(
    await prisma.notificationOutbox.count({
      where: { tenantId, eventType: "appointment.reminder_24h" },
    }),
    0,
  );
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: "active" },
  });
});

test("los reportes programados se envian por correo con CSV y se reagendan", async () => {
  const report = await prisma.scheduledReport.create({
    data: {
      tenantId,
      name: "Diario",
      frequency: "daily",
      recipientsJson: ["dueno@qa-worker.local"],
      format: "excel",
      channel: "email",
      nextRunAt: new Date(Date.now() - 60_000),
    },
  });

  // El plan Basico no incluye reportes programados: se registra el motivo.
  await runScheduledReports(prisma);
  const blocked = await prisma.scheduledReport.findUniqueOrThrow({
    where: { id: report.id },
  });
  assert.match(blocked.lastError ?? "", /plan/);

  await setPlan("negocio");
  await prisma.scheduledReport.update({
    where: { id: report.id },
    data: { nextRunAt: new Date(Date.now() - 60_000) },
  });
  await runScheduledReports(prisma);

  const email = await prisma.notificationOutbox.findFirstOrThrow({
    where: { tenantId, eventType: "report.scheduled" },
  });
  const payload = email.payloadJson as {
    attachments?: Array<{ filename: string; content: string }>;
  };
  assert.equal(email.to, "dueno@qa-worker.local");
  assert.match(payload.attachments?.[0].filename ?? "", /\.csv$/);
  assert.match(
    Buffer.from(payload.attachments![0].content, "base64").toString("utf8"),
    /^Profesional,Citas,Ingresos/,
  );

  const after = await prisma.scheduledReport.findUniqueOrThrow({
    where: { id: report.id },
  });
  assert.equal(after.lastError, null);
  assert.ok(
    after.nextRunAt! > new Date(),
    "queda agendado para la proxima vez",
  );
});
