import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@citas/db";
import { processInboundWhatsappMessage } from "../src/modules/messaging/assistant/index.js";
import { grantSubscription } from "./helpers.js";

const prisma = createPrismaClient();
const tenantId = "77777777-7777-4777-8777-777777777777";
const phone = "+50371112222";
const latePhone = "+50373334444";
const messageIds: string[] = [];

function futureDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function isoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function slashDate(date: Date) {
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    date.getFullYear(),
  ].join("/");
}

async function inbound(targetPhone: string, text: string) {
  const externalMessageId = `qa-booking-${randomUUID()}`;
  messageIds.push(externalMessageId);
  return processInboundWhatsappMessage(prisma, {
    tenantId,
    provider: "qa",
    externalMessageId,
    phone: targetPhone,
    text,
    pushName: "Cliente Flujo QA",
    raw: { source: "booking-integration-test" },
  });
}

async function cleanupTestTenant() {
  await prisma.appointment.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

test.before(async () => {
  await cleanupTestTenant();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: "Agenda QA",
      slug: "agenda-qa-whatsapp",
      timezone: "America/El_Salvador",
      currency: "USD",
      settings: {
        create: {
          bookingWindowDays: 45,
          cancelPolicyMinutes: 120,
        },
      },
      entitlements: {
        create: {
          key: "notifications.whatsapp.enabled",
          valueJson: { enabled: true },
        },
      },
    },
  });
  await grantSubscription(prisma, tenantId);
  const staff = await prisma.staff.create({
    data: {
      tenantId,
      displayName: "Profesional QA",
    },
  });
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
    await prisma.staffSchedule.create({
      data: {
        tenantId,
        staffId: staff.id,
        dayOfWeek,
        startTime: "09:00",
        endTime: "12:00",
      },
    });
  }
  await prisma.service.create({
    data: {
      tenantId,
      name: "Servicio QA",
      durationMinutes: 30,
      priceCents: 1500,
    },
  });
  await prisma.customer.createMany({
    data: [
      {
        tenantId,
        fullName: "Cliente Reserva QA",
        phone,
        whatsappOptInAt: new Date(),
      },
      {
        tenantId,
        fullName: "Cliente Política QA",
        phone: latePhone,
        whatsappOptInAt: new Date(),
      },
    ],
  });
});

test.after(async () => {
  await cleanupTestTenant();
  await prisma.$disconnect();
});

test("reserva, confirma, reagenda y cancela una cita con confirmaciones explícitas", async () => {
  const firstDate = futureDate(3);
  const secondDate = futureDate(4);

  assert.equal((await inbound(phone, "AGENDAR")).handled, "booking_start");
  assert.equal((await inbound(phone, "1")).handled, "booking_choose_staff");
  assert.equal((await inbound(phone, "1")).handled, "booking_choose_date");
  assert.equal(
    (await inbound(phone, slashDate(firstDate))).handled,
    "booking_choose_slot",
  );
  assert.equal(
    (await inbound(phone, "1")).handled,
    "booking_confirmation_requested",
  );
  assert.equal(
    await prisma.appointment.count({ where: { tenantId } }),
    0,
    "elegir un horario no debe reservar sin confirmación final",
  );

  const booked = await inbound(phone, "CONFIRMAR");
  assert.equal(booked.handled, "booking_completed");
  const appointment = await prisma.appointment.findFirstOrThrow({
    where: { tenantId, customer: { phone } },
  });
  assert.equal(appointment.source, "whatsapp");
  assert.equal(appointment.status, "pending");
  assert.equal(
    await prisma.notificationOutbox.count({
      where: {
        tenantId,
        eventType: "appointment.created",
        to: phone,
      },
    }),
    0,
    "la reserva por conversación no debe duplicar el mensaje de confirmación",
  );

  assert.equal(
    (await inbound(phone, "CONFIRMAR")).handled,
    "appointment_confirmed",
  );
  assert.equal(
    (
      await prisma.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
      })
    ).status,
    "confirmed",
  );

  assert.equal((await inbound(phone, "REAGENDAR")).handled, "reschedule_start");
  assert.equal(
    (await inbound(phone, isoDate(secondDate))).handled,
    "reschedule_choose_slot",
  );
  assert.equal(
    (await inbound(phone, "1")).handled,
    "reschedule_confirmation_requested",
  );
  assert.equal(
    isoDate(
      (
        await prisma.appointment.findUniqueOrThrow({
          where: { id: appointment.id },
        })
      ).startAt,
    ),
    isoDate(firstDate),
    "elegir un horario nuevo no debe modificar la cita sin confirmación",
  );

  assert.equal(
    (await inbound(phone, "CONFIRMAR")).handled,
    "reschedule_completed",
  );
  assert.equal(
    isoDate(
      (
        await prisma.appointment.findUniqueOrThrow({
          where: { id: appointment.id },
        })
      ).startAt,
    ),
    isoDate(secondDate),
  );

  assert.equal(
    (await inbound(phone, "CANCELAR")).handled,
    "appointment_cancelled",
  );
  assert.equal(
    (
      await prisma.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
      })
    ).status,
    "cancelled",
  );
});

test("deriva a recepción cuando la política impide cancelar tarde", async () => {
  const customer = await prisma.customer.findFirstOrThrow({
    where: { tenantId, phone: latePhone },
  });
  const staff = await prisma.staff.findFirstOrThrow({ where: { tenantId } });
  const service = await prisma.service.findFirstOrThrow({
    where: { tenantId },
  });
  const startAt = new Date(Date.now() + 60 * 60_000);
  const appointment = await prisma.appointment.create({
    data: {
      tenantId,
      customerId: customer.id,
      staffId: staff.id,
      status: "confirmed",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      priceCents: service.priceCents,
      currency: "USD",
      source: "whatsapp",
      services: {
        create: {
          serviceId: service.id,
          durationMinutes: service.durationMinutes,
          priceCents: service.priceCents,
        },
      },
    },
  });

  const result = await inbound(latePhone, "CANCELAR");
  assert.equal(result.handled, "cancellation_requires_agent");
  assert.equal(
    (
      await prisma.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
      })
    ).status,
    "confirmed",
  );
  const session = await prisma.whatsappConversationSession.findUniqueOrThrow({
    where: { tenantId_phone: { tenantId, phone: latePhone } },
  });
  assert.equal(session.state, "human_handoff");
  assert.equal(session.humanHandoff, true);
});
