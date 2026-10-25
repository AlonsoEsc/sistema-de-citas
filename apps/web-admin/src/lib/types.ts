export type Staff = {
  id: string;
  displayName: string;
  active: boolean;
  phone?: string | null;
};

export type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
};

export type Customer = {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
};

export type Appointment = {
  id: string;
  status: "pending" | "confirmed" | "cancelled" | "no_show" | "completed";
  startAt: string;
  endAt: string;
  priceCents: number;
  customer: Customer;
  staff: Staff;
  services: Array<{
    service: Service;
  }>;
};
