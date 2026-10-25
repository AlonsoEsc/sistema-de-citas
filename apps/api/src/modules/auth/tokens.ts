/** Tipos de JWT que emite la API. Cada guardia acepta solo el suyo. */
export const ADMIN_TOKEN_TYPE = "admin";
export const BOOKING_CUSTOMER_TOKEN_TYPE = "booking_customer";
export const GOOGLE_OAUTH_STATE_TYPE = "google_oauth";

export type AdminTokenPayload = {
  type: typeof ADMIN_TOKEN_TYPE;
  userId: string;
  tenantId: string;
  email: string;
};

export type BookingCustomerTokenPayload = {
  type: typeof BOOKING_CUSTOMER_TOKEN_TYPE;
  customerId: string;
  tenantId: string;
  phone?: string;
  email?: string;
};
