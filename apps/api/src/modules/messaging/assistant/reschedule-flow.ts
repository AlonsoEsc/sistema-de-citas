import { HttpError } from "../../../shared/errors.js";
import { isWithinBookingWindow } from "../../scheduling/availability.service.js";
import { rescheduleAppointment } from "../../scheduling/appointment.service.js";
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

/** Inicia el reagendamiento si la politica de anticipacion del negocio lo permite. */
export async function startReschedule(
  c: Conversation,
  appointment: { id: string; startAt: Date },
): Promise<AssistantResult> {
  const minutesUntilStart =
    (appointment.startAt.getTime() - Date.now()) / 60_000;
  if (minutesUntilStart < c.tenant.cancelPolicyMinutes) {
    await c.moveTo("human_handoff", undefined, { humanHandoff: true });
    await c.reply(
      messages.rescheduleRequiresAgent(c.tenant.cancelPolicyMinutes),
      "appointment.reschedule_requires_agent",
      appointment.id,
    );
    return {
      handled: "reschedule_requires_agent",
      appointmentId: appointment.id,
    };
  }
  await c.moveTo("awaiting_reschedule", { appointmentId: appointment.id });
  await c.reply(
    messages.rescheduleStart,
    "appointment.reschedule_start",
    appointment.id,
  );
  return { handled: "reschedule_start", appointmentId: appointment.id };
}

export async function chooseRescheduleDate(
  c: Conversation,
): Promise<AssistantResult> {
  const date = parseRequestedDate(c.message.text, c.tenant.timezone);
  if (!date) {
    await c.reply(
      messages.rescheduleInvalidDate,
      "appointment.reschedule.invalid_date",
    );
    return { handled: "reschedule_invalid_date" };
  }
  if (!isWithinBookingWindow(c.tenant, date)) {
    await c.reply(
      messages.rescheduleDateOutOfRange(c.tenant.bookingWindowDays),
      "appointment.reschedule.date_out_of_range",
    );
    return { handled: "reschedule_date_out_of_range" };
  }

  const appointmentId = String(c.flow.appointmentId ?? "");
  const appointment = await c.scope.db.appointment.findFirst({
    where: { id: appointmentId },
    include: { services: true, staff: true },
  });
  if (!appointment) {
    await c.moveTo("idle", null);
    await c.reply(
      messages.rescheduleNotFound,
      "appointment.reschedule.not_found",
    );
    return { handled: "reschedule_not_found" };
  }

  const slots = await slotsForConversation(c, {
    staffId: appointment.staffId,
    serviceIds: appointment.services.map((item) => item.serviceId),
    date,
    excludeAppointmentId: appointment.id,
  });
  if (!slots.length) {
    await c.reply(
      messages.rescheduleNoSlots,
      "appointment.reschedule.no_slots",
    );
    return { handled: "reschedule_no_slots" };
  }
  await c.moveTo("reschedule_slot", {
    appointmentId,
    staffName: appointment.staff.displayName,
    slots: slots.map((slot) => slot.toISOString()),
  });
  await c.reply(
    messages.rescheduleChooseSlot(slots, c.tenant.timezone),
    "appointment.reschedule.choose_slot",
  );
  return { handled: "reschedule_choose_slot" };
}

export async function chooseRescheduleSlot(
  c: Conversation,
): Promise<AssistantResult> {
  const slots = flowStrings(c.flow, "slots");
  const index = selectedIndex(c.command, slots.length);
  if (index < 0) {
    await c.reply(
      messages.rescheduleInvalidSlot,
      "appointment.reschedule.invalid_slot",
    );
    return { handled: "reschedule_invalid_slot" };
  }
  await c.moveTo("reschedule_confirm", { ...c.flow, startAt: slots[index] });
  await c.reply(
    messages.rescheduleSummary(new Date(slots[index]), c.tenant.timezone),
    "appointment.reschedule.confirmation_requested",
  );
  return { handled: "reschedule_confirmation_requested" };
}

export async function confirmReschedule(
  c: Conversation,
): Promise<AssistantResult> {
  const appointmentId = String(c.flow.appointmentId);
  if (isCommand(c.command, COMMANDS.changeRescheduleDate)) {
    await c.moveTo("awaiting_reschedule", { appointmentId });
    await c.reply(messages.changeDate, "appointment.reschedule.change_date");
    return { handled: "reschedule_change_date" };
  }
  if (!isCommand(c.command, COMMANDS.confirmStep)) {
    await c.reply(
      messages.rescheduleConfirmationInvalid,
      "appointment.reschedule.confirmation_invalid",
    );
    return { handled: "reschedule_confirmation_invalid" };
  }

  try {
    const updated = await rescheduleAppointment(
      c.scope,
      c.tenant,
      appointmentId,
      new Date(String(c.flow.startAt)),
      { actor: "customer", notificationChannels: [] },
    );
    await c.moveTo("idle", null);
    await c.reply(
      messages.rescheduled(updated.startAt, c.tenant.timezone),
      "appointment.rescheduled_by_whatsapp",
      updated.id,
    );
    return { handled: "reschedule_completed", appointmentId: updated.id };
  } catch (error) {
    if (
      error instanceof HttpError &&
      ["SCHEDULE_CONFLICT", "SLOT_NOT_AVAILABLE"].includes(error.code)
    ) {
      await c.moveTo("awaiting_reschedule", { appointmentId });
      await c.reply(
        messages.rescheduleConflict,
        "appointment.reschedule.conflict",
      );
      return { handled: "reschedule_conflict" };
    }
    throw error;
  }
}
