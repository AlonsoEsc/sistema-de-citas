import { HttpError } from "../../../shared/errors.js";
import { ACTIVE_APPOINTMENT_STATUSES } from "../../scheduling/availability.service.js";
import {
  cancelAppointmentByCustomer,
  updateAppointmentStatus,
} from "../../scheduling/appointment.service.js";
import { startBooking } from "./booking-flow.js";
import { COMMANDS, isCommand } from "./commands.js";
import type { AssistantResult, Conversation } from "./conversation.js";
import { messages } from "./messages.js";
import { startReschedule } from "./reschedule-flow.js";

/** Dias despues de una cita completada en que se acepta su calificacion. */
const FEEDBACK_WINDOW_DAYS = 7;

async function nextActiveAppointment(c: Conversation) {
  if (!c.customer) {
    return null;
  }
  return c.scope.db.appointment.findFirst({
    where: {
      customerId: c.customer.id,
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      endAt: { gt: new Date() },
    },
    include: { staff: true },
    orderBy: { startAt: "asc" },
  });
}

async function recordFeedback(
  c: Conversation,
  rating: number,
): Promise<AssistantResult | undefined> {
  if (!c.customer) {
    return undefined;
  }
  const completed = await c.scope.db.appointment.findFirst({
    where: {
      customerId: c.customer.id,
      status: "completed",
      endAt: {
        gte: new Date(Date.now() - FEEDBACK_WINDOW_DAYS * 86_400_000),
      },
      feedback: null,
    },
    orderBy: { endAt: "desc" },
  });
  if (!completed) {
    return undefined;
  }
  await c.scope.db.appointmentFeedback.create({
    data: {
      tenantId: c.scope.tenantId,
      appointmentId: completed.id,
      rating,
      source: "whatsapp",
    },
  });
  await c.reply(
    messages.feedbackThanks(rating),
    "appointment.feedback_received",
    completed.id,
  );
  return { handled: "feedback_received", appointmentId: completed.id };
}

/** Conversacion sin flujo en curso: acciones sobre la proxima cita, nueva reserva o menu. */
export async function handleIdle(c: Conversation): Promise<AssistantResult> {
  const appointment = await nextActiveAppointment(c);

  if (appointment && isCommand(c.command, COMMANDS.confirmAppointment)) {
    const updated = await updateAppointmentStatus(
      c.scope,
      c.tenant,
      appointment.id,
      "confirmed",
      {
        notificationChannels: [],
        idempotencySuffix: c.message.externalMessageId,
      },
    );
    await c.reply(
      messages.confirmed(
        updated.startAt,
        updated.staff.displayName,
        c.tenant.timezone,
      ),
      "appointment.confirmed_by_whatsapp",
      updated.id,
    );
    return { handled: "appointment_confirmed", appointmentId: updated.id };
  }

  if (appointment && isCommand(c.command, COMMANDS.cancelAppointment)) {
    try {
      const updated = await cancelAppointmentByCustomer(c.scope, c.tenant, {
        appointmentId: appointment.id,
        customerId: appointment.customerId,
        notificationChannels: [],
        idempotencySuffix: c.message.externalMessageId,
      });
      await c.reply(
        messages.cancelled(updated.startAt, c.tenant.timezone),
        "appointment.cancelled_by_whatsapp",
        updated.id,
      );
      return { handled: "appointment_cancelled", appointmentId: updated.id };
    } catch (error) {
      if (
        error instanceof HttpError &&
        error.code === "CANCELLATION_WINDOW_CLOSED"
      ) {
        await c.moveTo("human_handoff", undefined, { humanHandoff: true });
        await c.reply(
          messages.cancellationRequiresAgent(error.message),
          "appointment.cancellation_requires_agent",
          appointment.id,
        );
        return {
          handled: "cancellation_requires_agent",
          appointmentId: appointment.id,
        };
      }
      throw error;
    }
  }

  if (!appointment && /^[1-5]$/.test(c.command)) {
    const feedback = await recordFeedback(c, Number(c.command));
    if (feedback) {
      return feedback;
    }
  }

  if (appointment && isCommand(c.command, COMMANDS.rescheduleAppointment)) {
    return startReschedule(c, appointment);
  }

  if (isCommand(c.command, COMMANDS.startBooking)) {
    return startBooking(c);
  }

  await c.reply(
    messages.menu({
      pushName: c.message.pushName,
      tenantName: c.tenant.name,
      nextAppointment: appointment
        ? {
            startAt: appointment.startAt,
            staffName: appointment.staff.displayName,
            timeZone: c.tenant.timezone,
          }
        : undefined,
    }),
    "whatsapp.assistant.menu",
  );
  return { handled: "menu" };
}
