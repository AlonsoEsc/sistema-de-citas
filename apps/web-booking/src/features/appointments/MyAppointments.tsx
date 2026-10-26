import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX2 } from "lucide-react";
import { BackButton, Button, Notice } from "../../components/ui";
import { bookingApi } from "../../lib/api";
import { apiErrorMessage } from "../../lib/errors";
import {
  formatDateLabel,
  useTenantProfile,
  useTerms,
} from "../../lib/tenant-profile";
import type { CustomerAppointment } from "../../lib/types";

const STATUS_LABEL: Partial<Record<CustomerAppointment["status"], string>> = {
  pending: "Pendiente de confirmar",
  confirmed: "Confirmada",
};

/** Proximas citas del cliente, con opcion de cancelar segun la politica del negocio. */
export function MyAppointments({
  slug,
  onBack,
  onBook,
}: {
  slug: string;
  onBack: () => void;
  onBook: () => void;
}) {
  const profile = useTenantProfile();
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const appointments = useQuery({
    queryKey: ["my-appointments", slug],
    queryFn: async () =>
      (
        await bookingApi.get<CustomerAppointment[]>(
          `/public/${slug}/my-appointments`,
        )
      ).data,
  });

  const cancel = useMutation({
    mutationFn: async (appointmentId: string) =>
      bookingApi.post(`/public/${slug}/cancel`, { appointmentId }),
    onSuccess: async () => {
      setConfirming(null);
      setNotice({
        tone: "success",
        text: `Tu ${terms.appointment} fue cancelada.`,
      });
      await queryClient.invalidateQueries({
        queryKey: ["my-appointments", slug],
      });
    },
    onError: (error) => {
      setConfirming(null);
      setNotice({
        tone: "error",
        text: apiErrorMessage(
          error,
          `No se pudo cancelar. Comunícate con ${profile.name}.`,
        ),
      });
    },
  });

  return (
    <div className="space-y-5">
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold">Mis {terms.appointments}</h2>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {appointments.isLoading ? (
        <p className="text-sm text-ink-muted">Cargando…</p>
      ) : appointments.isError ? (
        <Notice tone="error">
          {apiErrorMessage(appointments.error, "No pudimos cargar tus citas.")}
        </Notice>
      ) : (appointments.data ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface-muted px-6 py-10 text-center">
          <CalendarX2 className="size-8 text-ink-muted" />
          <p className="text-sm text-ink-muted">
            No tienes {terms.appointments} próximas.
          </p>
          <Button onClick={onBook}>Reservar ahora</Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {(appointments.data ?? []).map((appointment) => (
            <li
              key={appointment.id}
              className="space-y-3 rounded-2xl border border-line bg-surface p-4"
            >
              <div>
                <p className="font-semibold first-letter:uppercase">
                  {formatDateLabel(appointment.startAt, profile)}
                </p>
                <p className="text-sm text-ink-muted">
                  {appointment.services
                    .map((item) => item.service.name)
                    .join(", ")}{" "}
                  · {appointment.staff.displayName}
                </p>
                {STATUS_LABEL[appointment.status] && (
                  <p className="mt-1 text-xs text-ink-muted">
                    {STATUS_LABEL[appointment.status]}
                  </p>
                )}
              </div>
              {confirming === appointment.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">
                    ¿Seguro que quieres cancelarla?
                  </span>
                  <Button
                    variant="secondary"
                    className="h-10 text-danger"
                    loading={cancel.isPending}
                    onClick={() => cancel.mutate(appointment.id)}
                  >
                    Sí, cancelar
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-10"
                    onClick={() => setConfirming(null)}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  className="h-10"
                  onClick={() => {
                    setNotice(null);
                    setConfirming(appointment.id);
                  }}
                >
                  Cancelar {terms.appointment}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
