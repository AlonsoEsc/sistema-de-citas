import { Prisma, type PrismaClient } from "@citas/db";
import {
  normalizePhone,
  queueAppointmentNotifications,
  queueWhatsappReply,
} from "./notification-service.js";
import { mirrorInboundToChatwoot } from "./chatwoot-service.js";
import { buildAvailabilityForStaff } from "./availability.js";
import {
  cancelAppointmentByCustomer,
  createAppointment,
  rescheduleAppointment,
} from "./appointment-service.js";
import { HttpError } from "../lib/http-error.js";

type InboundMessage = {
  tenantId: string;
  provider: string;
  externalMessageId: string;
  phone: string;
  text: string;
  pushName?: string;
  raw: unknown;
};

function normalizedCommand(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function contextOf(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function selectedIndex(command: string, length: number) {
  const value = Number.parseInt(command, 10);
  return Number.isInteger(value) && value >= 1 && value <= length
    ? value - 1
    : -1;
}

function dateBounds(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);
  return { start, end };
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseRequestedDate(command: string, now = new Date()) {
  const normalized = normalizedCommand(command);
  if (normalized === "hoy") {
    return isoDate(now);
  }
  if (normalized === "manana") {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return isoDate(tomorrow);
  }

  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const value = slashMatch
    ? `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`
    : normalized;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) || isoDate(parsed) !== value
    ? undefined
    : value;
}

function dateWithinBookingWindow(
  date: string,
  bookingWindowDays: number,
  now = new Date(),
) {
  const requested = new Date(`${date}T12:00:00`);
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const lastDate = new Date(today);
  lastDate.setDate(lastDate.getDate() + bookingWindowDays);
  return requested >= today && requested <= lastDate;
}

function formatDateTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

function bookingSummary(context: Record<string, unknown>, timeZone: string) {
  return [
    "Confirma los datos de tu cita:",
    `Servicio: ${String(context.serviceName ?? "Seleccionado")}`,
    `Profesional: ${String(context.staffName ?? "Seleccionado")}`,
    `Fecha y hora: ${formatDateTime(new Date(String(context.startAt)), timeZone)}`,
    "",
    "Responde CONFIRMAR para reservar, CAMBIAR para elegir otra fecha o CANCELAR PROCESO.",
  ].join("\n");
}

async function availabilityFor(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    staffId: string;
    serviceIds: string[];
    date: string;
    excludeAppointmentId?: string;
  },
) {
  const services = await prisma.service.findMany({
    where: {
      tenantId: input.tenantId,
      id: { in: input.serviceIds },
      active: true,
    },
  });
  if (services.length !== input.serviceIds.length) {
    return [];
  }
  const duration = services.reduce(
    (sum, service) => sum + service.durationMinutes,
    0,
  );
  const bounds = dateBounds(input.date);
  const [schedules, appointments] = await Promise.all([
    prisma.staffSchedule.findMany({
      where: {
        tenantId: input.tenantId,
        staffId: input.staffId,
        dayOfWeek: bounds.start.getDay(),
      },
    }),
    prisma.appointment.findMany({
      where: {
        tenantId: input.tenantId,
        staffId: input.staffId,
        status: { in: ["pending", "confirmed"] },
        id: input.excludeAppointmentId
          ? { not: input.excludeAppointmentId }
          : undefined,
        startAt: { lt: bounds.end },
        endAt: { gt: bounds.start },
      },
    }),
  ]);
  return buildAvailabilityForStaff(
    input.date,
    duration,
    schedules,
    appointments,
  )
    .filter((slot) => new Date(slot.startAt).getTime() > Date.now())
    .slice(0, 10);
}

async function reply(
  prisma: PrismaClient,
  input: InboundMessage,
  message: string,
  eventType: string,
  appointmentId?: string,
) {
  await queueWhatsappReply(prisma, {
    tenantId: input.tenantId,
    phone: input.phone,
    message,
    eventType,
    appointmentId,
    idempotencyKey: `${input.tenantId}:${input.provider}:${input.externalMessageId}:reply:${eventType}`,
  });
}

export async function processInboundWhatsappMessage(
  prisma: PrismaClient,
  input: InboundMessage,
) {
  const phone = normalizePhone(input.phone);
  if (!phone || !input.externalMessageId) {
    return { ignored: true, reason: "missing_phone_or_message_id" };
  }

  try {
    await prisma.whatsappMessage.create({
      data: {
        tenantId: input.tenantId,
        direction: "inbound",
        provider: input.provider,
        externalMessageId: input.externalMessageId,
        phone,
        content: input.text,
        eventType: "message.received",
        deliveryStatus: "delivered",
        rawJson: input.raw as Prisma.InputJsonValue,
        receivedAt: new Date(),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { duplicate: true };
    }
    throw error;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    include: { settings: true },
  });
  if (!tenant) {
    return { ignored: true, reason: "tenant_not_found" };
  }

  const session = await prisma.whatsappConversationSession.upsert({
    where: { tenantId_phone: { tenantId: input.tenantId, phone } },
    create: {
      tenantId: input.tenantId,
      phone,
      lastInboundAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
    update: {
      lastInboundAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  });

  try {
    await mirrorInboundToChatwoot(prisma, {
      tenantId: input.tenantId,
      phone,
      name: input.pushName,
      content: input.text,
      externalMessageId: input.externalMessageId,
    });
  } catch (error) {
    console.error("[chatwoot] inbound mirror failed", error);
  }

  const customer = await prisma.customer.findFirst({
    where: { tenantId: input.tenantId, phone },
  });
  const command = normalizedCommand(input.text);
  const bookingWindowDays = tenant.settings?.bookingWindowDays ?? 30;

  if (
    ["stop", "baja", "salir", "no mensajes", "cancelar suscripcion"].includes(
      command,
    )
  ) {
    if (customer) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { whatsappOptOutAt: new Date() },
      });
    }
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: {
        state: "opted_out",
        humanHandoff: false,
        contextJson: Prisma.JsonNull,
      },
    });
    await reply(
      prisma,
      input,
      "Listo. No enviaremos más mensajes automáticos por WhatsApp. Puedes escribir ALTA para reactivarlos.",
      "whatsapp.opt_out",
    );
    return { handled: "opt_out" };
  }

  if (["alta", "activar", "iniciar mensajes"].includes(command)) {
    if (customer) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { whatsappOptOutAt: null, whatsappOptInAt: new Date() },
      });
    }
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: { state: "idle" },
    });
    await reply(
      prisma,
      input,
      "Mensajes reactivados. Escribe MENU para ver las opciones.",
      "whatsapp.opt_in",
    );
    return { handled: "opt_in" };
  }

  if (session.state === "opted_out") {
    return { ignored: true, reason: "opted_out" };
  }

  if (["asesor", "humano", "recepcion", "persona"].includes(command)) {
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: { state: "human_handoff", humanHandoff: true },
    });
    await reply(
      prisma,
      input,
      "Te estamos transfiriendo con recepción. Un miembro del equipo continuará la conversación.",
      "whatsapp.handoff_requested",
    );
    return { handled: "handoff" };
  }

  if (session.humanHandoff && !["bot", "menu"].includes(command)) {
    return { handled: "human_handoff_active" };
  }
  if (session.humanHandoff) {
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: { humanHandoff: false, state: "idle" },
    });
  }

  const sessionContext = contextOf(session.contextJson);
  if (command === "menu" || command === "cancelar proceso") {
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: { state: "idle", contextJson: Prisma.JsonNull },
    });
  } else if (session.state === "booking_service") {
    const services = await prisma.service.findMany({
      where: { tenantId: input.tenantId, active: true },
      orderBy: { name: "asc" },
    });
    const index = selectedIndex(command, services.length);
    if (index < 0) {
      await reply(
        prisma,
        input,
        `Selecciona un servicio respondiendo con su número:\n${services.map((service, position) => `${position + 1}. ${service.name}`).join("\n")}`,
        "appointment.booking.invalid_service",
      );
      return { handled: "booking_invalid_service" };
    }
    const staff = await prisma.staff.findMany({
      where: { tenantId: input.tenantId, active: true },
      orderBy: { displayName: "asc" },
    });
    if (!staff.length) {
      await reply(
        prisma,
        input,
        "No hay profesionales disponibles. Escribe ASESOR.",
        "appointment.booking.no_staff",
      );
      return { handled: "booking_no_staff" };
    }
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: {
        state: "booking_staff",
        contextJson: {
          serviceIds: [services[index].id],
          serviceName: services[index].name,
        },
      },
    });
    await reply(
      prisma,
      input,
      `Elige profesional:\n${staff.map((member, position) => `${position + 1}. ${member.displayName}`).join("\n")}`,
      "appointment.booking.choose_staff",
    );
    return { handled: "booking_choose_staff" };
  } else if (session.state === "booking_staff") {
    const staff = await prisma.staff.findMany({
      where: { tenantId: input.tenantId, active: true },
      orderBy: { displayName: "asc" },
    });
    const index = selectedIndex(command, staff.length);
    if (index < 0) {
      await reply(
        prisma,
        input,
        `Responde con el número del profesional:\n${staff.map((member, position) => `${position + 1}. ${member.displayName}`).join("\n")}`,
        "appointment.booking.invalid_staff",
      );
      return { handled: "booking_invalid_staff" };
    }
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: {
        state: "booking_date",
        contextJson: {
          ...sessionContext,
          staffId: staff[index].id,
          staffName: staff[index].displayName,
        },
      },
    });
    await reply(
      prisma,
      input,
      "¿Para qué fecha deseas la cita? Responde HOY, MAÑANA, DD/MM/AAAA o AAAA-MM-DD.",
      "appointment.booking.choose_date",
    );
    return { handled: "booking_choose_date" };
  } else if (session.state === "booking_date") {
    const requestedDate = parseRequestedDate(input.text);
    if (!requestedDate) {
      await reply(
        prisma,
        input,
        "Escribe HOY, MAÑANA o una fecha en formato DD/MM/AAAA o AAAA-MM-DD.",
        "appointment.booking.invalid_date",
      );
      return { handled: "booking_invalid_date" };
    }
    if (!dateWithinBookingWindow(requestedDate, bookingWindowDays)) {
      await reply(
        prisma,
        input,
        `La fecha debe estar entre hoy y los próximos ${bookingWindowDays} días.`,
        "appointment.booking.date_out_of_range",
      );
      return { handled: "booking_date_out_of_range" };
    }
    const serviceIds = Array.isArray(sessionContext.serviceIds)
      ? sessionContext.serviceIds.map(String)
      : [];
    const staffId = String(sessionContext.staffId ?? "");
    const slots = await availabilityFor(prisma, {
      tenantId: input.tenantId,
      staffId,
      serviceIds,
      date: requestedDate,
    });
    if (!slots.length) {
      await reply(
        prisma,
        input,
        "No hay horarios disponibles ese día. Responde con otra fecha AAAA-MM-DD o escribe ASESOR.",
        "appointment.booking.no_slots",
      );
      return { handled: "booking_no_slots" };
    }
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: {
        state: "booking_slot",
        contextJson: {
          ...sessionContext,
          date: requestedDate,
          slots: slots.map((slot) => slot.startAt),
        },
      },
    });
    await reply(
      prisma,
      input,
      `Elige horario:\n${slots.map((slot, position) => `${position + 1}. ${new Date(slot.startAt).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })}`).join("\n")}`,
      "appointment.booking.choose_slot",
    );
    return { handled: "booking_choose_slot" };
  } else if (session.state === "booking_slot") {
    const slots = Array.isArray(sessionContext.slots)
      ? sessionContext.slots.map(String)
      : [];
    const index = selectedIndex(command, slots.length);
    if (index < 0) {
      await reply(
        prisma,
        input,
        "Responde con el número de uno de los horarios mostrados.",
        "appointment.booking.invalid_slot",
      );
      return { handled: "booking_invalid_slot" };
    }
    const nextContext: Record<string, unknown> = {
      ...sessionContext,
      startAt: slots[index],
    };
    if (!customer) {
      await prisma.whatsappConversationSession.update({
        where: { id: session.id },
        data: {
          state: "booking_name",
          contextJson: nextContext as Prisma.InputJsonValue,
        },
      });
      await reply(
        prisma,
        input,
        "Para terminar, escribe tu nombre completo.",
        "appointment.booking.ask_name",
      );
      return { handled: "booking_ask_name" };
    }
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: {
        state: "booking_confirm",
        contextJson: {
          ...nextContext,
          customerId: customer.id,
        } as Prisma.InputJsonValue,
      },
    });
    await reply(
      prisma,
      input,
      bookingSummary(nextContext, tenant.timezone),
      "appointment.booking.confirmation_requested",
    );
    return { handled: "booking_confirmation_requested" };
  } else if (session.state === "booking_name") {
    if (input.text.trim().length < 2) {
      await reply(
        prisma,
        input,
        "Escribe tu nombre completo.",
        "appointment.booking.invalid_name",
      );
      return { handled: "booking_invalid_name" };
    }
    const nextContext = {
      ...sessionContext,
      customerName: input.text.trim(),
    };
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: {
        state: "booking_confirm",
        contextJson: nextContext as Prisma.InputJsonValue,
      },
    });
    await reply(
      prisma,
      input,
      bookingSummary(nextContext, tenant.timezone),
      "appointment.booking.confirmation_requested",
    );
    return { handled: "booking_confirmation_requested" };
  } else if (session.state === "booking_confirm") {
    if (["cambiar", "reagendar", "otra fecha"].includes(command)) {
      await prisma.whatsappConversationSession.update({
        where: { id: session.id },
        data: {
          state: "booking_date",
          contextJson: {
            ...sessionContext,
            startAt: undefined,
            slots: undefined,
          } as Prisma.InputJsonValue,
        },
      });
      await reply(
        prisma,
        input,
        "Indica otra fecha: HOY, MAÑANA, DD/MM/AAAA o AAAA-MM-DD.",
        "appointment.booking.change_date",
      );
      return { handled: "booking_change_date" };
    }
    if (!["confirmar", "confirmo", "si", "sí"].includes(command)) {
      await reply(
        prisma,
        input,
        "Responde CONFIRMAR para reservar, CAMBIAR para elegir otra fecha o CANCELAR PROCESO.",
        "appointment.booking.confirmation_invalid",
      );
      return { handled: "booking_confirmation_invalid" };
    }

    try {
      const appointment = await createAppointment(prisma, {
        tenantId: input.tenantId,
        source: "whatsapp",
        enforceSingleActiveByPhone: true,
        notificationChannels: [],
        staffId: String(sessionContext.staffId),
        serviceIds: (sessionContext.serviceIds as unknown[]).map(String),
        startAt: new Date(String(sessionContext.startAt)),
        customerId: sessionContext.customerId
          ? String(sessionContext.customerId)
          : undefined,
        customer: sessionContext.customerId
          ? undefined
          : {
              fullName: String(sessionContext.customerName),
              phone,
            },
      });
      await prisma.whatsappConversationSession.update({
        where: { id: session.id },
        data: { state: "idle", contextJson: Prisma.JsonNull },
      });
      await reply(
        prisma,
        input,
        `Cita reservada para ${formatDateTime(appointment.startAt, tenant.timezone)} con ${appointment.staff.displayName}. Responde CONFIRMAR para confirmar asistencia, REAGENDAR o CANCELAR.`,
        "appointment.booked_by_whatsapp",
        appointment.id,
      );
      return { handled: "booking_completed", appointmentId: appointment.id };
    } catch (error) {
      if (
        error instanceof HttpError &&
        ["SCHEDULE_CONFLICT", "ACTIVE_PHONE_APPOINTMENT"].includes(error.code)
      ) {
        await prisma.whatsappConversationSession.update({
          where: { id: session.id },
          data: {
            state: "booking_date",
            contextJson: {
              ...sessionContext,
              startAt: undefined,
              slots: undefined,
            } as Prisma.InputJsonValue,
          },
        });
        await reply(
          prisma,
          input,
          `${error.message}. Elige otra fecha o escribe MENU.`,
          "appointment.booking.conflict",
        );
        return { handled: "booking_conflict" };
      }
      throw error;
    }
  } else if (session.state === "awaiting_reschedule") {
    const requestedDate = parseRequestedDate(input.text);
    if (!requestedDate) {
      await reply(
        prisma,
        input,
        "Escribe HOY, MAÑANA o la nueva fecha en formato DD/MM/AAAA o AAAA-MM-DD.",
        "appointment.reschedule.invalid_date",
      );
      return { handled: "reschedule_invalid_date" };
    }
    if (!dateWithinBookingWindow(requestedDate, bookingWindowDays)) {
      await reply(
        prisma,
        input,
        `La nueva fecha debe estar entre hoy y los próximos ${bookingWindowDays} días.`,
        "appointment.reschedule.date_out_of_range",
      );
      return { handled: "reschedule_date_out_of_range" };
    }
    const appointmentId = String(sessionContext.appointmentId ?? "");
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId: input.tenantId },
      include: { services: true, staff: true },
    });
    if (!appointment) {
      await prisma.whatsappConversationSession.update({
        where: { id: session.id },
        data: { state: "idle", contextJson: Prisma.JsonNull },
      });
      await reply(
        prisma,
        input,
        "La cita ya no está disponible para reagendar.",
        "appointment.reschedule.not_found",
      );
      return { handled: "reschedule_not_found" };
    }
    const slots = await availabilityFor(prisma, {
      tenantId: input.tenantId,
      staffId: appointment.staffId,
      serviceIds: appointment.services.map((item) => item.serviceId),
      date: requestedDate,
      excludeAppointmentId: appointment.id,
    });
    if (!slots.length) {
      await reply(
        prisma,
        input,
        "No hay horarios ese día. Escribe otra fecha AAAA-MM-DD.",
        "appointment.reschedule.no_slots",
      );
      return { handled: "reschedule_no_slots" };
    }
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: {
        state: "reschedule_slot",
        contextJson: {
          appointmentId,
          staffName: appointment.staff.displayName,
          slots: slots.map((slot) => slot.startAt),
        },
      },
    });
    await reply(
      prisma,
      input,
      `Elige el nuevo horario:\n${slots.map((slot, position) => `${position + 1}. ${new Date(slot.startAt).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })}`).join("\n")}`,
      "appointment.reschedule.choose_slot",
    );
    return { handled: "reschedule_choose_slot" };
  } else if (session.state === "reschedule_slot") {
    const slots = Array.isArray(sessionContext.slots)
      ? sessionContext.slots.map(String)
      : [];
    const index = selectedIndex(command, slots.length);
    if (index < 0) {
      await reply(
        prisma,
        input,
        "Responde con el número del nuevo horario.",
        "appointment.reschedule.invalid_slot",
      );
      return { handled: "reschedule_invalid_slot" };
    }
    const nextContext = {
      ...sessionContext,
      startAt: slots[index],
    };
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: {
        state: "reschedule_confirm",
        contextJson: nextContext as Prisma.InputJsonValue,
      },
    });
    await reply(
      prisma,
      input,
      `Confirma el cambio de tu cita para ${formatDateTime(new Date(slots[index]), tenant.timezone)}.\n\nResponde CONFIRMAR, CAMBIAR o CANCELAR PROCESO.`,
      "appointment.reschedule.confirmation_requested",
    );
    return { handled: "reschedule_confirmation_requested" };
  } else if (session.state === "reschedule_confirm") {
    if (["cambiar", "otra fecha"].includes(command)) {
      await prisma.whatsappConversationSession.update({
        where: { id: session.id },
        data: {
          state: "awaiting_reschedule",
          contextJson: {
            appointmentId: String(sessionContext.appointmentId),
          },
        },
      });
      await reply(
        prisma,
        input,
        "Indica otra fecha: HOY, MAÑANA, DD/MM/AAAA o AAAA-MM-DD.",
        "appointment.reschedule.change_date",
      );
      return { handled: "reschedule_change_date" };
    }
    if (!["confirmar", "confirmo", "si", "sí"].includes(command)) {
      await reply(
        prisma,
        input,
        "Responde CONFIRMAR para aplicar el cambio, CAMBIAR para elegir otra fecha o CANCELAR PROCESO.",
        "appointment.reschedule.confirmation_invalid",
      );
      return { handled: "reschedule_confirmation_invalid" };
    }
    try {
      const updated = await rescheduleAppointment(
        prisma,
        input.tenantId,
        String(sessionContext.appointmentId),
        new Date(String(sessionContext.startAt)),
      );
      await prisma.whatsappConversationSession.update({
        where: { id: session.id },
        data: { state: "idle", contextJson: Prisma.JsonNull },
      });
      await reply(
        prisma,
        input,
        `Cita reagendada para ${formatDateTime(updated.startAt, tenant.timezone)}.`,
        "appointment.rescheduled_by_whatsapp",
        updated.id,
      );
      return { handled: "reschedule_completed", appointmentId: updated.id };
    } catch (error) {
      if (error instanceof HttpError && error.code === "SCHEDULE_CONFLICT") {
        await prisma.whatsappConversationSession.update({
          where: { id: session.id },
          data: {
            state: "awaiting_reschedule",
            contextJson: {
              appointmentId: String(sessionContext.appointmentId),
            },
          },
        });
        await reply(
          prisma,
          input,
          "Ese horario acaba de ocuparse. Indica otra fecha.",
          "appointment.reschedule.conflict",
        );
        return { handled: "reschedule_conflict" };
      }
      throw error;
    }
  }

  const activeAppointment = customer
    ? await prisma.appointment.findFirst({
        where: {
          tenantId: input.tenantId,
          customerId: customer.id,
          status: { in: ["pending", "confirmed"] },
          endAt: { gt: new Date() },
        },
        include: {
          customer: true,
          staff: true,
          services: { include: { service: true } },
        },
        orderBy: { startAt: "asc" },
      })
    : null;

  if (
    ["confirmar", "confirmo", "si confirmo", "1"].includes(command) &&
    activeAppointment
  ) {
    const updated = await prisma.appointment.update({
      where: { id: activeAppointment.id },
      data: { status: "confirmed" },
      include: {
        customer: true,
        staff: true,
        services: { include: { service: true } },
      },
    });
    await queueAppointmentNotifications(
      prisma,
      updated,
      "appointment.confirmed",
      {
        channels: [],
        idempotencySuffix: input.externalMessageId,
      },
    );
    await reply(
      prisma,
      input,
      `Cita confirmada para ${updated.startAt.toLocaleString("es-SV")} con ${updated.staff.displayName}.`,
      "appointment.confirmed_by_whatsapp",
      updated.id,
    );
    return { handled: "appointment_confirmed", appointmentId: updated.id };
  }

  if (["cancelar", "cancelo", "3"].includes(command) && activeAppointment) {
    try {
      const updated = await cancelAppointmentByCustomer(prisma, {
        tenantId: input.tenantId,
        appointmentId: activeAppointment.id,
        customerId: activeAppointment.customerId,
        notificationChannels: [],
        idempotencySuffix: input.externalMessageId,
      });
      await reply(
        prisma,
        input,
        `Tu cita del ${formatDateTime(updated.startAt, tenant.timezone)} fue cancelada. Escribe AGENDAR para reservar otra.`,
        "appointment.cancelled_by_whatsapp",
        updated.id,
      );
      return { handled: "appointment_cancelled", appointmentId: updated.id };
    } catch (error) {
      if (
        error instanceof HttpError &&
        error.code === "CANCELLATION_WINDOW_CLOSED"
      ) {
        await prisma.whatsappConversationSession.update({
          where: { id: session.id },
          data: { state: "human_handoff", humanHandoff: true },
        });
        await reply(
          prisma,
          input,
          `${error.message}. Te comunicaremos con recepción para revisar el caso.`,
          "appointment.cancellation_requires_agent",
          activeAppointment.id,
        );
        return {
          handled: "cancellation_requires_agent",
          appointmentId: activeAppointment.id,
        };
      }
      throw error;
    }
  }

  if (/^[1-5]$/.test(command) && customer && !activeAppointment) {
    const completedAppointment = await prisma.appointment.findFirst({
      where: {
        tenantId: input.tenantId,
        customerId: customer.id,
        status: "completed",
        endAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
        feedback: null,
      },
      orderBy: { endAt: "desc" },
    });
    if (completedAppointment) {
      await prisma.appointmentFeedback.create({
        data: {
          tenantId: input.tenantId,
          appointmentId: completedAppointment.id,
          rating: Number(command),
          source: "whatsapp",
        },
      });
      await reply(
        prisma,
        input,
        `Gracias por calificarnos con ${command}/5. Tu opinión nos ayuda a mejorar.`,
        "appointment.feedback_received",
        completedAppointment.id,
      );
      return {
        handled: "feedback_received",
        appointmentId: completedAppointment.id,
      };
    }
  }

  if (
    ["reagendar", "cambiar cita", "2"].includes(command) &&
    activeAppointment
  ) {
    const policyMinutes = tenant.settings?.cancelPolicyMinutes ?? 0;
    const minutesUntilStart =
      (activeAppointment.startAt.getTime() - Date.now()) / 60_000;
    if (minutesUntilStart < policyMinutes) {
      await prisma.whatsappConversationSession.update({
        where: { id: session.id },
        data: { state: "human_handoff", humanHandoff: true },
      });
      await reply(
        prisma,
        input,
        `Esta cita requiere al menos ${policyMinutes} minutos de anticipación para reagendarse en línea. Te comunicaremos con recepción.`,
        "appointment.reschedule_requires_agent",
        activeAppointment.id,
      );
      return {
        handled: "reschedule_requires_agent",
        appointmentId: activeAppointment.id,
      };
    }
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: {
        state: "awaiting_reschedule",
        contextJson: { appointmentId: activeAppointment.id },
      },
    });
    await reply(
      prisma,
      input,
      "¿Para qué nueva fecha deseas la cita? Responde HOY, MAÑANA, DD/MM/AAAA o AAAA-MM-DD. Tu horario actual seguirá reservado hasta confirmar el cambio.",
      "appointment.reschedule_start",
      activeAppointment.id,
    );
    return { handled: "reschedule_start", appointmentId: activeAppointment.id };
  }

  if (["agendar", "reservar", "nueva cita", "cita"].includes(command)) {
    const services = await prisma.service.findMany({
      where: { tenantId: input.tenantId, active: true },
      orderBy: { name: "asc" },
    });
    if (!services.length) {
      await reply(
        prisma,
        input,
        "No hay servicios disponibles. Escribe ASESOR.",
        "appointment.booking.no_services",
      );
      return { handled: "booking_no_services" };
    }
    await prisma.whatsappConversationSession.update({
      where: { id: session.id },
      data: { state: "booking_service", contextJson: Prisma.JsonNull },
    });
    await reply(
      prisma,
      input,
      `Selecciona un servicio:\n${services.map((service, position) => `${position + 1}. ${service.name}`).join("\n")}\n\nResponde con el número o escribe CANCELAR PROCESO.`,
      "appointment.booking_start",
    );
    return { handled: "booking_start" };
  }

  const appointmentLine = activeAppointment
    ? `\nTu próxima cita es ${activeAppointment.startAt.toLocaleString("es-SV")} con ${activeAppointment.staff.displayName}.`
    : "";
  await reply(
    prisma,
    input,
    `Hola${input.pushName ? ` ${input.pushName}` : ""}. Soy el asistente de ${tenant.name}.${appointmentLine}\n\nEscribe:\n1 o CONFIRMAR\n2 o REAGENDAR\n3 o CANCELAR\nAGENDAR para una nueva cita\nASESOR para hablar con recepción\nSTOP para dejar de recibir mensajes.`,
    "whatsapp.assistant.menu",
  );
  return { handled: "menu" };
}
