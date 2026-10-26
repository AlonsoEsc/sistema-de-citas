import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useApiMutation } from "../../lib/mutation";

export type Staff = {
  id: string;
  displayName: string;
  phone: string | null;
  commissionType: "fixed" | "percent" | null;
  commissionValue: string | number | null;
  active: boolean;
};

export type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
};

export type ScheduleBreak = { start: string; end: string };

export type ScheduleSegment = {
  /** Viene en las respuestas de la API; no se envia al guardar. */
  staffId?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakJson?: ScheduleBreak[] | null;
};

export type StaffInput = {
  displayName: string;
  phone?: string;
  active?: boolean;
};

export type ServiceInput = {
  name: string;
  durationMinutes: number;
  priceCents: number;
  active?: boolean;
};

export const catalogKeys = {
  staff: ["staff"] as const,
  services: ["services"] as const,
  schedule: (staffId: string) => ["staff", staffId, "schedule"] as const,
};

export function useStaff() {
  return useQuery({
    queryKey: catalogKeys.staff,
    queryFn: async () => (await api.get<Staff[]>("/staff")).data,
  });
}

export function useServices() {
  return useQuery({
    queryKey: catalogKeys.services,
    queryFn: async () => (await api.get<Service[]>("/services")).data,
  });
}

export function useStaffSchedule(staffId: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.schedule(staffId ?? ""),
    enabled: Boolean(staffId),
    queryFn: async () =>
      (await api.get<ScheduleSegment[]>(`/staff/${staffId}/schedule`)).data,
  });
}

/** Horarios de todo el personal activo: la agenda los usa para acotar las horas visibles. */
export function useAllSchedules(staff: Staff[] | undefined) {
  const ids = (staff ?? [])
    .filter((item) => item.active)
    .map((item) => item.id);
  return useQuery({
    queryKey: ["staff", "schedules", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        ids.map(
          async (id) =>
            (await api.get<ScheduleSegment[]>(`/staff/${id}/schedule`)).data,
        ),
      );
      return results.flat();
    },
  });
}

const onboardingKey = ["onboarding"];

export function useSaveStaff() {
  return useApiMutation({
    mutationFn: async ({ id, ...input }: StaffInput & { id?: string }) =>
      id
        ? (await api.patch<Staff>(`/staff/${id}`, input)).data
        : (await api.post<Staff>("/staff", input)).data,
    invalidate: [catalogKeys.staff, onboardingKey],
    success: "Guardado.",
    error: "No se pudo guardar.",
  });
}

export function useSaveSchedule(staffId: string) {
  return useApiMutation({
    mutationFn: async (segments: ScheduleSegment[]) =>
      (await api.put(`/staff/${staffId}/schedule`, segments)).data,
    invalidate: [
      catalogKeys.schedule(staffId),
      ["staff", "schedules"],
      onboardingKey,
    ],
    success: "Horario guardado.",
    error: "No se pudo guardar el horario.",
  });
}

export function useSaveService() {
  return useApiMutation({
    mutationFn: async ({ id, ...input }: ServiceInput & { id?: string }) =>
      id
        ? (await api.patch<Service>(`/services/${id}`, input)).data
        : (await api.post<Service>("/services", input)).data,
    invalidate: [catalogKeys.services, onboardingKey],
    success: "Guardado.",
    error: "No se pudo guardar.",
  });
}
