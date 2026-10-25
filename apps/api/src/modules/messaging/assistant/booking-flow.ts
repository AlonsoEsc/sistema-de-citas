import { HttpError } from "../../../shared/errors.js";
import { isWithinBookingWindow } from "../../scheduling/availability.service.js";
import { createAppointment } from "../../scheduling/appointment.service.js";
import {
  COMMANDS,
  isCommand,
  parseRequestedDate,
  selectedIndex,
} from "./commands.js";
import {
  flowStrings,
  type AssistantResult,
  type Conversation,
} from "./conversation.js";
import { messages } from "./messages.js";
import { slotsForConversation } from "./slots.js";

/** Errores de reserva que se resuelven eligiendo otra fecha, no derivando a recepcion. */
const RECOVERABLE_BOOKING_ERRORS = [
  "SCHEDULE_CONFLICT",
  "ACTIVE_PHONE_APPOINTMENT",
  "SLOT_NOT_AVAILABLE",
  "OUTSIDE_BOOKING_WINDOW",
];

function activeServices({ scope }: Conversation) {
  return scope.db.service.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
}

function activeStaff({ scope }: Conversation) {
  return scope.db.staff.findMany({
    where: { active: true },
    orderBy: { displayName: "asc" },
  });
}

function bookingSummary(conversation: Conversation, startAt: string) {
  return messages.bookingSummary({
    serviceName: String(conversation.flow.serviceName ?? "Seleccionado"),
    staffName: String(conversation.flow.staffName ?? "Seleccionado"),
    startAt: new Date(startAt),
    timeZone: conversation.tenant.timezone,
  });
}

export async function startBooking(c: Conversation): Promise<AssistantResult> {
  const services = await activeServices(c);
  if (!services.length) {
    await c.reply(messages.noServices, "appointment.booking.no_services");
    return { handled: "booking_no_services" };
  }
  await c.moveTo("booking_service", null);
  await c.reply(
    messages.chooseService(services.map((service) => service.name)),
    "appointment.booking_start",
  );
  return { handled: "booking_start" };
}

export async function chooseService(c: Conversation): Promise<AssistantResult> {
  const services = await activeServices(c);
  const index = selectedIndex(c.command, services.length);
  if (index < 0) {
    await c.reply(
      messages.invalidService(services.map((service) => service.name)),
      "appointment.booking.invalid_service",
    );
    return { handled: "booking_invalid_service" };
  }
  const staff = await activeStaff(c);
  if (!staff.length) {
    await c.reply(messages.noStaff, "appointment.booking.no_staff");
    return { handled: "booking_no_staff" };
  }
  await c.moveTo("booking_staff", {
    serviceIds: [services[index].id],
    serviceName: services[index].name,
  });
  await c.reply(
    messages.chooseStaff(staff.map((member) => member.displayName)),
    "appointment.booking.choose_staff",
  );
  return { handled: "booking_choose_staff" };
}

export async function chooseStaff(c: Conversation): Promise<AssistantResult> {
  const staff = await activeStaff(c);
  const index = selectedIndex(c.command, staff.length);
  if (index < 0) {
    await c.reply(
      messages.invalidStaff(staff.map((member) => member.displayName)),
      "appointment.booking.invalid_staff",
    );
    return { handled: "booking_invalid_staff" };
  }
  await c.moveTo("booking_date", {
    ...c.flow,
    staffId: staff[index].id,
    staffName: staff[index].displayName,
  });
  await c.reply(messages.chooseDate, "appointment.booking.choose_date");
  return { handled: "booking_choose_date" };
}

export async function chooseDate(c: Conversation): Promise<AssistantResult> {
  const date = parseRequestedDate(c.message.text, c.tenant.timezone);
  if (!date) {
    await c.reply(messages.invalidDate, "appointment.booking.invalid_date");
    return { handled: "booking_invalid_date" };
  }
  if (!isWithinBookingWindow(c.tenant, date)) {
    await c.reply(
      messages.dateOutOfRange(c.tenant.bookingWindowDays),
      "appointment.booking.date_out_of_range",
    );
    return { handled: "booking_date_out_of_range" };
  }
  const slots = await slotsForConversation(c, {
    staffId: String(c.flow.staffId ?? ""),
    serviceIds: flowStrings(c.flow, "serviceIds"),
    date,
  });
  if (!slots.length) {
    await c.reply(messages.noSlots, "appointment.booking.no_slots");
    return { handled: "booking_no_slots" };
  }
  await c.moveTo("booking_slot", {
    ...c.flow,
    date,
    slots: slots.map((slot) => slot.toISOString()),
  });
  await c.reply(
    messages.chooseSlot(slots, c.tenant.timezone),
    "appointment.booking.choose_slot",
  );
  return { handled: "booking_choose_slot" };
}

export async function chooseSlot(c: Conversation): Promise<AssistantResult> {
  const slots = flowStrings(c.flow, "slots");
  const index = selectedIndex(c.command, slots.length);
  if (index < 0) {
    await c.reply(messages.invalidSlot, "appointment.booking.invalid_slot");
    return { handled: "booking_invalid_slot" };
  }
  const flow = { ...c.flow, startAt: slots[index] };
  if (!c.customer) {
    await c.moveTo("booking_name", flow);
    await c.reply(messages.askName, "appointment.booking.ask_name");
    return { handled: "booking_ask_name" };
  }
  await c.moveTo("booking_confirm", { ...flow, customerId: c.customer.id });
  await c.reply(
    bookingSummary({ ...c, flow }, slots[index]),
    "appointment.booking.confirmation_requested",
  );
  return { handled: "booking_confirmation_requested" };
}

export async function captureName(c: Conversation): Promise<AssistantResult> {
  const name = c.message.text.trim();
  if (name.length < 2) {
    await c.reply(messages.invalidName, "appointment.booking.invalid_name");
    return { handled: "booking_invalid_name" };
  }
  const flow = { ...c.flow, customerName: name };
  await c.moveTo("booking_confirm", flow);
  await c.reply(
    bookingSummary({ ...c, flow }, String(c.flow.startAt)),
    "appointment.booking.confirmation_requested",
  );
  return { handled: "booking_confirmation_requested" };
}

function withoutSelectedSlot(flow: Conversation["flow"]) {
  const { startAt: _startAt, slots: _slots, ...rest } = flow;
  return rest;
}

export async function confirmBooking(
  c: Conversation,
): Promise<AssistantResult> {
  if (isCommand(c.command, COMMANDS.changeBookingDate)) {
    await c.moveTo("booking_date", withoutSelectedSlot(c.flow));
    await c.reply(messages.changeDate, "appointment.booking.change_date");
    return { handled: "booking_change_date" };
  }
  if (!isCommand(c.command, COMMANDS.confirmStep)) {
    await c.reply(
      messages.bookingConfirmationInvalid,
      "appointment.booking.confirmation_invalid",
    );
    return { handled: "booking_confirmation_invalid" };
  }

  const customerId = c.flow.customerId ? String(c.flow.customerId) : undefined;
  try {
    const appointment = await createAppointment(c.scope, c.tenant, {
      source: "whatsapp",
      actor: "customer",
      enforceSingleActiveByPhone: true,
      // El asistente ya confirma en la conversacion; no se duplica el aviso.
      notificationChannels: [],
      staffId: String(c.flow.staffId),
      serviceIds: flowStrings(c.flow, "serviceIds"),
      startAt: new Date(String(c.flow.startAt)),
      customerId,
      customer: customerId
        ? undefined
        : { fullName: String(c.flow.customerName), phone: c.message.phone },
    });
    await c.moveTo("idle", null);
    await c.reply(
      messages.booked(
        appointment.startAt,
        appointment.staff.displayName,
        c.tenant.timezone,
      ),
      "appointment.booked_by_whatsapp",
      appointment.id,
    );
    return { handled: "booking_completed", appointmentId: appointment.id };
  } catch (error) {
    if (
      error instanceof HttpError &&
      RECOVERABLE_BOOKING_ERRORS.includes(error.code)
    ) {
      await c.moveTo("booking_date", withoutSelectedSlot(c.flow));
      await c.reply(
        messages.bookingConflict(error.message),
        "appointment.booking.conflict",
      );
      return { handled: "booking_conflict" };
    }
    throw error;
  }
}
