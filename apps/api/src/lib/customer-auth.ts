import type { FastifyReply, FastifyRequest } from "fastify";
import { unauthorized } from "./http-error.js";

type BookingCustomerPayload = {
  type: "booking_customer";
  customerId: string;
  tenantId: string;
  phone?: string;
  email?: string;
};

export async function requireBookingCustomerAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  try {
    const payload = await request.jwtVerify<BookingCustomerPayload>();
    if (payload.type !== "booking_customer") {
      throw unauthorized("Token de cliente invalido", "INVALID_BOOKING_TOKEN");
    }
    request.customerAuth = payload;
  } catch {
    throw unauthorized(
      "Necesitas verificar tu telefono para continuar",
      "BOOKING_AUTH_REQUIRED",
    );
  }
}
