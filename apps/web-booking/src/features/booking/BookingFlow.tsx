import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, UserRound } from "lucide-react";
import { addCalendarDays } from "@citas/shared/time";
import {
  BackButton,
  Button,
  Notice,
  SectionTitle,
  cx,
} from "../../components/ui";
import { bookingApi } from "../../lib/api";
import { apiErrorMessage } from "../../lib/errors";
import { authHeader, type BookingSession } from "../../lib/session";
import {
  formatCurrency,
  formatDayChip,
  formatSlotTime,
  todayForTenant,
  useTenantProfile,
  useTerms,
} from "../../lib/tenant-profile";
import type { AvailabilityResponse, Service, Staff } from "../../lib/types";
import { bookableSlots, groupByDayPart, type BookableSlot } from "./slots";

/** Fechas que se muestran como botones; mas alla, el negocio no recibe reservas. */
const MAX_DAY_CHIPS = 21;
const ANY_STAFF = "";

export type BookedAppointment = {
  serviceName: string;
  staffName: string;
  startAt: string;
};

const optionClass = (selected: boolean) =>
  cx(
    "rounded-xl border text-left transition",
    selected
      ? "border-primary bg-primary-soft ring-1 ring-primary"
      : "border-line bg-surface hover:border-primary/50",
  );

export function BookingFlow({
  slug,
  session,
  onBack,
  onBooked,
}: {
  slug: string;
  session: BookingSession;
  onBack: () => void;
  onBooked: (appointment: BookedAppointment) => void;
}) {
  const profile = useTenantProfile();
  const terms = useTerms();
  const queryClient = useQueryClient();
  const today = todayForTenant(profile);

  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState(ANY_STAFF);
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<BookableSlot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const services = useQuery({
    queryKey: ["public-services", slug],
    queryFn: async () =>
      (await bookingApi.get<Service[]>(`/public/${slug}/services`)).data,
  });
  const staff = useQuery({
    queryKey: ["public-staff", slug],
    queryFn: async () =>
      (await bookingApi.get<Staff[]>(`/public/${slug}/staff`)).data,
  });
  const availability = useQuery({
    queryKey: ["availability", slug, serviceId, staffId, date],
    enabled: Boolean(serviceId && date),
    queryFn: async () =>
      (
        await bookingApi.get<AvailabilityResponse>(
          `/public/${slug}/availability`,
          {
            params: {
              date,
              serviceIds: serviceId,
              staffId: staffId || undefined,
            },
          },
        )
      ).data,
  });

  const days = useMemo(
    () =>
      Array.from(
        { length: Math.min(profile.bookingWindowDays, MAX_DAY_CHIPS) },
        (_, index) => addCalendarDays(today, index),
      ),
    [profile.bookingWindowDays, today],
  );
  const slots = bookableSlots(availability.data);
  const hourOf = (iso: string) =>
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: profile.timezone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date(iso)),
    );
  const service = services.data?.find((item) => item.id === serviceId);

  const book = useMutation({
    mutationFn: async (chosen: BookableSlot) =>
      bookingApi.post(
        `/public/${slug}/book`,
        {
          staffId: chosen.staffId,
          serviceIds: [serviceId],
          startAt: chosen.startAt,
        },
        { headers: authHeader(session) },
      ),
    onSuccess: async (_response, chosen) => {
      await queryClient.invalidateQueries({
        queryKey: ["my-appointments", slug],
      });
      onBooked({
        serviceName: service?.name ?? "",
        staffName: chosen.staffName,
        startAt: chosen.startAt,
      });
    },
    onError: async (error) => {
      setProblem(
        apiErrorMessage(error, "No se pudo reservar. Elige otro horario."),
      );
      setSlot(null);
      // El horario pudo ocuparse mientras el cliente elegia: se refrescan los disponibles.
      await availability.refetch();
    },
  });

  const reset = (
    next: Partial<{ serviceId: string; staffId: string; date: string }>,
  ) => {
    setSlot(null);
    setProblem(null);
    if (next.serviceId !== undefined) setServiceId(next.serviceId);
    if (next.staffId !== undefined) setStaffId(next.staffId);
    if (next.date !== undefined) setDate(next.date);
  };

  return (
    <div className="space-y-7">
      <BackButton onClick={onBack} />

      <section className="space-y-3">
        <SectionTitle step={1}>{terms.Services}</SectionTitle>
        {services.isLoading && (
          <p className="text-sm text-ink-muted">Cargando…</p>
        )}
        <div className="grid gap-2">
          {services.data?.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={serviceId === item.id}
              onClick={() => reset({ serviceId: item.id })}
              className={cx(
                optionClass(serviceId === item.id),
                "flex items-center gap-3 px-4 py-3",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.name}</span>
                <span className="flex items-center gap-1 text-xs text-ink-muted">
                  <Clock className="size-3.5" /> {item.durationMinutes} min
                </span>
              </span>
              <span className="font-semibold">
                {formatCurrency(item.priceCents, profile)}
              </span>
            </button>
          ))}
        </div>
      </section>

      {serviceId && (
        <section className="space-y-3">
          <SectionTitle step={2}>¿Con quién?</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { id: ANY_STAFF, displayName: "Cualquiera disponible" },
              ...(staff.data ?? []),
            ].map((item) => (
              <button
                key={item.id || "any"}
                type="button"
                aria-pressed={staffId === item.id}
                onClick={() => reset({ staffId: item.id })}
                className={cx(
                  optionClass(staffId === item.id),
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium",
                )}
              >
                <UserRound className="size-4 text-ink-muted" />
                {item.displayName}
              </button>
            ))}
          </div>
        </section>
      )}

      {serviceId && (
        <section className="space-y-3">
          <SectionTitle step={3}>Día</SectionTitle>
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {days.map((day) => {
              const label = formatDayChip(day, profile);
              return (
                <li key={day} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={date === day}
                    aria-label={label.full}
                    onClick={() => reset({ date: day })}
                    className={cx(
                      optionClass(date === day),
                      "flex w-16 flex-col items-center py-2.5 text-center",
                    )}
                  >
                    <span className="text-xs text-ink-muted capitalize">
                      {day === today ? "hoy" : label.weekday}
                    </span>
                    <span className="text-lg font-semibold">{label.day}</span>
                    <span className="text-xs text-ink-muted">
                      {label.month}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {serviceId && (
        <section className="space-y-3" aria-live="polite">
          <SectionTitle step={4}>Hora</SectionTitle>
          {problem && <Notice tone="error">{problem}</Notice>}
          {availability.isLoading ? (
            <p className="text-sm text-ink-muted">Buscando horarios…</p>
          ) : availability.isError ? (
            <Notice tone="error">
              {apiErrorMessage(
                availability.error,
                "No pudimos cargar los horarios.",
              )}
            </Notice>
          ) : slots.length === 0 ? (
            <p className="rounded-xl bg-surface-muted px-4 py-6 text-center text-sm text-ink-muted">
              No hay horarios libres este día. Prueba con otra fecha
              {staffId ? ` u otro ${terms.staffMember}` : ""}.
            </p>
          ) : (
            groupByDayPart(slots, hourOf).map((group) => (
              <div key={group.label} className="space-y-2">
                <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                  {group.label}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {group.slots.map((item) => (
                    <button
                      key={item.startAt}
                      type="button"
                      aria-pressed={slot?.startAt === item.startAt}
                      onClick={() => setSlot(item)}
                      className={cx(
                        "h-11 rounded-xl border text-sm font-semibold transition",
                        slot?.startAt === item.startAt
                          ? "border-primary bg-primary text-on-primary"
                          : "border-line bg-surface hover:border-primary/50",
                      )}
                    >
                      {formatSlotTime(item.startAt, profile)}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {slot && service && (
        <section className="sticky bottom-4 space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-lg">
          <p className="text-sm">
            <span className="font-semibold">{service.name}</span> con{" "}
            {slot.staffName}
          </p>
          <p className="text-sm text-ink-muted first-letter:uppercase">
            {formatDayChip(date, profile).full},{" "}
            {formatSlotTime(slot.startAt, profile)} ·{" "}
            {formatCurrency(service.priceCents, profile)}
          </p>
          <Button
            className="w-full"
            loading={book.isPending}
            onClick={() => book.mutate(slot)}
          >
            Confirmar {terms.appointment}
          </Button>
        </section>
      )}
    </div>
  );
}
