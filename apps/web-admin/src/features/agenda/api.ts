import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useApiMutation } from "../../lib/mutation";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "no_show"
  | "completed";

export type Appointment = {
  id: string;
  status: AppointmentStatus;
  startAt: string;
  endAt: string;
  priceCents: number;
  currency: string;
  source: "admin" | "portal" | "whatsapp";
  staffId: string;
  customerId: string;
  customer: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
  };
  staff: { id: string; displayName: string };
  services: Array<{
    serviceId: string;
    durationMinutes: number;
    priceCents: number;
    service: { id: string; name: string };
  }>;
};

export type NewAppointmentInput = {
  staffId: string;
  serviceIds: string[];
  startAt: string;
  customerId?: string;
  customer?: { fullName: string; phone?: string; email?: string };
};

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  no_show: "No asistió",
  cancelled: "Cancelada",
};

export const STATUS_TONES = {
  pending: "warning",
  confirmed: "primary",
  completed: "success",
  no_show: "danger",
  cancelled: "neutral",
} as const satisfies Record<AppointmentStatus, string>;

/** Completadas y no asistidas son historial: no se pueden borrar. */
export const HISTORICAL_STATUSES: AppointmentStatus[] = [
  "completed",
  "no_show",
];

export const appointmentKeys = {
  all: ["appointments"] as const,
  range: (from: string, to: string, staffId?: string) =>
    ["appointments", from, to, staffId ?? "all"] as const,
};

/** Citas que se cruzan con el rango [from, to) (instantes ISO). */
export function useAppointments(range: {
  from: string;
  to: string;
  staffId?: string;
}) {
  return useQuery({
    queryKey: appointmentKeys.range(range.from, range.to, range.staffId),
    queryFn: async () =>
      (
        await api.get<Appointment[]>("/appointments", {
          params: {
            from: range.from,
            to: range.to,
            staffId: range.staffId || undefined,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
}

const affected = [appointmentKeys.all, ["onboarding"], ["reports"]];

export function useCreateAppointment() {
  return useApiMutation({
    mutationFn: async (input: NewAppointmentInput) =>
      (await api.post<Appointment>("/appointments", input)).data,
    invalidate: [...affected, ["customers"]],
    success: "Cita agendada.",
    error: "No se pudo agendar.",
  });
}

export function useUpdateStatus() {
  return useApiMutation({
    mutationFn: async (input: {
      id: string;
      status: AppointmentStatus;
      suppressNotifications?: boolean;
    }) =>
      (
        await api.patch<Appointment>(`/appointments/${input.id}/status`, {
          status: input.status,
          suppressNotifications: input.suppressNotifications,
        })
      ).data,
    invalidate: affected,
    success: (result) =>
      `Cita marcada como ${STATUS_LABELS[result.status].toLowerCase()}.`,
    error: "No se pudo cambiar el estado.",
  });
}

export function useReschedule() {
  return useApiMutation({
    mutationFn: async (input: { id: string; startAt: string }) =>
      (
        await api.patch<Appointment>(`/appointments/${input.id}/reschedule`, {
          startAt: input.startAt,
        })
      ).data,
    invalidate: affected,
    success: "Cita reprogramada.",
    error: "No se pudo reprogramar.",
  });
}

export function useDeleteAppointment() {
  return useApiMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/appointments/${id}`)).data,
    invalidate: affected,
    success: "Cita eliminada.",
    error: "No se pudo eliminar.",
  });
}
