export type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
};

export type Staff = {
  id: string;
  displayName: string;
};

export type AvailabilityResponse = {
  durationMinutes: number;
  data: Array<{
    staffId: string;
    displayName: string;
    slots: Array<{
      startAt: string;
      endAt: string;
    }>;
  }>;
};

export type CustomerAppointment = {
  id: string;
  status: "pending" | "confirmed" | "cancelled" | "no_show" | "completed";
  startAt: string;
  endAt: string;
  staff: {
    id: string;
    displayName: string;
  };
  services: Array<{
    service: {
      id: string;
      name: string;
      durationMinutes: number;
      priceCents: number;
    };
  }>;
};
