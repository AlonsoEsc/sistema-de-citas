import { HttpError } from "../../../shared/errors.js";
import { getAvailability } from "../../scheduling/availability.service.js";
import type { Conversation } from "./conversation.js";

/** Cantidad de horarios que se ofrecen por mensaje para que la lista sea legible. */
const SLOTS_PER_MESSAGE = 10;

export async function slotsForConversation(
  conversation: Conversation,
  input: {
    staffId: string;
    serviceIds: string[];
    date: string;
    excludeAppointmentId?: string;
  },
): Promise<Date[]> {
  try {
    const { staff } = await getAvailability(
      conversation.scope,
      conversation.tenant,
      input,
    );
    return (staff[0]?.slots ?? [])
      .slice(0, SLOTS_PER_MESSAGE)
      .map((slot) => new Date(slot.startAt));
  } catch (error) {
    // Servicios desactivados o fecha invalida: para el cliente equivale a "sin horarios".
    if (error instanceof HttpError && error.statusCode === 400) {
      return [];
    }
    throw error;
  }
}
