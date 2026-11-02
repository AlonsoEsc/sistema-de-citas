import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useApiMutation } from "../../lib/mutation";

export type Overview = {
  from: string;
  to: string;
  metrics: {
    totalAppointments: number;
    totalRevenueCents: number;
    noShows: number;
    cancellationRate: number;
  };
  byStaff: Array<{
    staffId: string;
    name: string;
    revenueCents: number;
    appointments: number;
  }>;
  byDay: Array<{ date: string; appointments: number; revenueCents: number }>;
  byService: Array<{
    serviceId: string;
    name: string;
    appointments: number;
    revenueCents: number;
  }>;
};

export type ScheduledReport = {
  id: string;
  name: string;
  frequency: "daily" | "weekly" | "monthly";
  recipients: string[];
  format: string;
  channel: "email" | "whatsapp";
  enabled: boolean;
  lastSentAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
};

export type ScheduledReportInput = Pick<
  ScheduledReport,
  "name" | "frequency" | "recipients" | "channel" | "enabled"
>;

export const reportKeys = {
  overview: (from: string, to: string) =>
    ["reports", "overview", from, to] as const,
  scheduled: ["reports", "scheduled"] as const,
};

/** Resumen del periodo [from, to) calculado por la API en la zona del negocio. */
export function useOverview(
  range: { from: string; to: string },
  enabled = true,
) {
  return useQuery({
    queryKey: reportKeys.overview(range.from, range.to),
    enabled,
    queryFn: async () =>
      (await api.get<Overview>("/reports/overview", { params: range })).data,
  });
}

export function useScheduledReports() {
  return useQuery({
    queryKey: reportKeys.scheduled,
    queryFn: async () =>
      (await api.get<ScheduledReport[]>("/reports/scheduled")).data,
  });
}

export function useSaveScheduledReport() {
  return useApiMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<ScheduledReportInput> & { id?: string }) =>
      id
        ? (await api.patch<ScheduledReport>(`/reports/scheduled/${id}`, input))
            .data
        : (await api.post<ScheduledReport>("/reports/scheduled", input)).data,
    invalidate: [reportKeys.scheduled],
    success: "Reporte guardado.",
    error: "No se pudo guardar el reporte.",
  });
}

export function useDeleteScheduledReport() {
  return useApiMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/reports/scheduled/${id}`)).data,
    invalidate: [reportKeys.scheduled],
    success: "Reporte eliminado.",
    error: "No se pudo eliminar.",
  });
}
