import { Link } from "react-router";
import {
  CalendarCheck,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
} from "lucide-react";
import { PERMISSIONS } from "@citas/shared/access";
import { zonedDayRange } from "@citas/shared/time";
import { Button } from "../../components/ui/button";
import { useToast } from "../../components/ui/toast";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LoadingRows,
  PageHeader,
  Skeleton,
} from "../../components/ui/surface";
import { cx } from "../../lib/cx";
import { useAuth } from "../../state/auth";
import { useTenant, type Terms } from "../../state/tenant";
import { STATUS_LABELS, STATUS_TONES, useAppointments } from "../agenda/api";
import { useOverview } from "../reports/api";
import { periodRange } from "../reports/periods";
import { useOnboarding, type OnboardingStepKey } from "./api";

function stepCopy(
  terms: Terms,
): Record<OnboardingStepKey, { label: string; to: string }> {
  return {
    verify_email: { label: "Confirma tu correo", to: "/cuenta" },
    add_services: {
      label: `Agrega tus ${terms.services.toLowerCase()}`,
      to: "/catalogo?tab=servicios",
    },
    add_staff: {
      label: `Agrega a tu ${terms.staff.toLowerCase()}`,
      to: "/catalogo",
    },
    set_schedule: { label: "Define los horarios de atención", to: "/catalogo" },
    connect_whatsapp: {
      label: "Conecta WhatsApp (opcional)",
      to: "/ajustes/integraciones",
    },
    first_appointment: {
      label: `Recibe tu primera ${terms.appointment.toLowerCase()}`,
      to: "/portal",
    },
  };
}

function Checklist() {
  const { terms } = useTenant();
  const onboarding = useOnboarding();
  if (!onboarding.data || onboarding.data.completed) {
    return null;
  }
  const copy = stepCopy(terms);
  const percent = Math.round(onboarding.data.progress * 100);
  return (
    <Card className="mb-6">
      <CardHeader
        title="Deja tu negocio listo para recibir reservas"
        description={`${percent}% completado`}
      />
      <div className="px-5 pt-4">
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avance de la configuración"
          className="h-2 overflow-hidden rounded-full bg-surface-muted"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <ul className="grid gap-1 p-3 sm:grid-cols-2">
        {onboarding.data.steps.map((step) => (
          <li key={step.key}>
            <Link
              to={copy[step.key].to}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-surface-muted",
                step.done && "text-ink-muted line-through",
              )}
            >
              {step.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-success" />
              ) : (
                <Circle className="size-5 shrink-0 text-ink-muted" />
              )}
              {copy[step.key].label}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value?: string;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-sm text-ink-muted">{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

function BookingLinkCard() {
  const { bookingUrl } = useTenant();
  const toast = useToast();
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold">Tu enlace de reservas</p>
      <p className="mt-1 truncate text-sm text-primary">{bookingUrl}</p>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<Copy className="size-3.5" />}
          onClick={() =>
            navigator.clipboard
              .writeText(bookingUrl)
              .then(() => toast.success("Enlace copiado."))
              .catch(() => toast.error("No se pudo copiar el enlace."))
          }
        >
          Copiar
        </Button>
        <a
          href={bookingUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink"
        >
          <ExternalLink className="size-3.5" /> Abrir
        </a>
      </div>
    </Card>
  );
}

export function OverviewPage() {
  const { tenant, terms, format } = useTenant();
  const { can } = useAuth();
  const canSeeReports = can(PERMISSIONS.reportsView);
  const today = format.calendarDate(new Date());
  const todayRange = zonedDayRange(today, tenant.timezone);

  const todays = useAppointments({
    from: todayRange.start.toISOString(),
    to: todayRange.end.toISOString(),
  });
  const month = useOverview(
    periodRange("this_month", today, tenant.timezone),
    canSeeReports,
  );

  const active = (todays.data ?? []).filter(
    (item) => item.status !== "cancelled",
  );
  const upcoming = active.find((item) => new Date(item.endAt) > new Date());
  const metrics = month.data?.metrics;

  return (
    <>
      <PageHeader
        title="Resumen"
        description={
          <span className="inline-block first-letter:uppercase">
            {format.dayLabel(new Date())}
          </span>
        }
      />
      <Checklist />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={`${terms.appointments} de hoy`}
          value={todays.data ? String(active.length) : undefined}
          hint={
            upcoming
              ? `Siguiente: ${format.time(upcoming.startAt)}`
              : "Sin pendientes"
          }
        />
        {canSeeReports && (
          <>
            <Kpi
              label="Ingresos del mes"
              value={metrics && format.money(metrics.totalRevenueCents)}
              hint="Citas confirmadas y completadas"
            />
            <Kpi
              label={`${terms.appointments} del mes`}
              value={metrics && String(metrics.totalAppointments)}
              hint={metrics && `${metrics.noShows} no asistieron`}
            />
            <Kpi
              label="Cancelaciones"
              value={metrics && format.percent(metrics.cancellationRate)}
              hint="Del total del mes"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader
            title={`${terms.appointments} de hoy`}
            actions={
              <Link
                to="/agenda"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Ver agenda
              </Link>
            }
          />
          {todays.isLoading ? (
            <LoadingRows />
          ) : (todays.data ?? []).length === 0 ? (
            <EmptyState
              icon={<CalendarCheck className="size-5" />}
              title={`No hay ${terms.appointments.toLowerCase()} para hoy`}
              description="Comparte tu enlace de reservas para empezar a recibirlas."
            />
          ) : (
            <ul className="divide-y divide-line">
              {(todays.data ?? []).map((item) => (
                <li key={item.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">
                    {format.time(item.startAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.customer.fullName}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {item.services
                        .map((line) => line.service.name)
                        .join(", ")}{" "}
                      · {item.staff.displayName}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONES[item.status]}>
                    {STATUS_LABELS[item.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <BookingLinkCard />
        </div>
      </div>
    </>
  );
}
