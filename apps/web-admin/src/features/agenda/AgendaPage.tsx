import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PERMISSIONS } from "@citas/shared/access";
import {
  addCalendarDays,
  wallTimeToMinutes,
  zonedDateTime,
  zonedDayRange,
} from "@citas/shared/time";
import { Button, IconButton } from "../../components/ui/button";
import { Card, ErrorState, PageHeader } from "../../components/ui/surface";
import { apiErrorMessage } from "../../lib/errors";
import { cx } from "../../lib/cx";
import { useMediaQuery } from "../../lib/hooks";
import { useAuth } from "../../state/auth";
import { useTenant } from "../../state/tenant";
import { useAllSchedules, useStaff } from "../catalog/api";
import { useAppointments, type Appointment } from "./api";
import { AppointmentDialog } from "./AppointmentDialog";
import { visibleHours, weekOf } from "./layout";
import { NewAppointmentDialog } from "./NewAppointmentDialog";
import { WeekGrid } from "./WeekGrid";

type View = "day" | "week";

export function AgendaPage() {
  const { tenant, terms, format, readOnly } = useTenant();
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.appointmentsManage);
  const isWide = useMediaQuery("(min-width: 768px)");
  const today = format.calendarDate(new Date());

  const [anchor, setAnchor] = useState(today);
  const [viewChoice, setViewChoice] = useState<View | null>(null);
  const [staffId, setStaffId] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [draft, setDraft] = useState<{ date: string; time: string } | null>(
    null,
  );

  const view: View = viewChoice ?? (isWide ? "week" : "day");
  const days = view === "week" ? weekOf(anchor) : [anchor];
  const from = zonedDayRange(days[0], tenant.timezone).start.toISOString();
  const to = zonedDayRange(
    days[days.length - 1],
    tenant.timezone,
  ).end.toISOString();

  const staff = useStaff();
  const schedules = useAllSchedules(staff.data);
  const appointments = useAppointments({ from, to, staffId });

  const visible = useMemo(
    () =>
      (appointments.data ?? []).filter(
        (item) => showCancelled || item.status !== "cancelled",
      ),
    [appointments.data, showCancelled],
  );

  const hours = visibleHours(
    schedules.data ?? [],
    visible.map((item) => ({
      start: wallTimeToMinutes(format.wallTime(item.startAt)),
      end: wallTimeToMinutes(format.wallTime(item.endAt)) || 24 * 60,
    })),
  );

  const step = view === "week" ? 7 : 1;
  const rangeLabel =
    view === "week"
      ? `${format.date(zonedDateTime(days[0], "12:00", tenant.timezone))} – ${format.date(zonedDateTime(days[6], "12:00", tenant.timezone))}`
      : format.dayLabel(zonedDateTime(anchor, "12:00", tenant.timezone));

  const canCreate = canManage && !readOnly;
  const openNew = (date = anchor, time = "09:00") => setDraft({ date, time });

  return (
    <>
      <PageHeader
        title="Agenda"
        description={`${visible.length} ${visible.length === 1 ? terms.appointment.toLowerCase() : terms.appointments.toLowerCase()} en este periodo`}
        actions={
          canCreate && (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => openNew()}
            >
              Nueva {terms.appointment.toLowerCase()}
            </Button>
          )
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-1">
            <IconButton
              label="Periodo anterior"
              onClick={() => setAnchor(addCalendarDays(anchor, -step))}
            >
              <ChevronLeft className="size-4" />
            </IconButton>
            <IconButton
              label="Periodo siguiente"
              onClick={() => setAnchor(addCalendarDays(anchor, step))}
            >
              <ChevronRight className="size-4" />
            </IconButton>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAnchor(today)}
            >
              Hoy
            </Button>
          </div>
          <p className="order-first w-full truncate text-sm font-semibold first-letter:uppercase sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">
            {rangeLabel}
          </p>

          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              className="accent-[var(--primary)]"
              checked={showCancelled}
              onChange={(event) => setShowCancelled(event.target.checked)}
            />
            Canceladas
          </label>
          <select
            aria-label={`Filtrar por ${terms.staffMember.toLowerCase()}`}
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}
            className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
          >
            <option value="">Todo el equipo</option>
            {(staff.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </select>
          <div
            role="group"
            aria-label="Vista"
            className="flex rounded-lg bg-surface-muted p-0.5 text-xs font-medium"
          >
            {(["day", "week"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setViewChoice(value)}
                className={cx(
                  "rounded-md px-3 py-1.5",
                  view === value
                    ? "bg-surface text-ink shadow-sm"
                    : "text-ink-muted",
                )}
              >
                {value === "day" ? "Día" : "Semana"}
              </button>
            ))}
          </div>
        </div>

        {appointments.isError ? (
          <ErrorState
            message={apiErrorMessage(
              appointments.error,
              "No se pudo cargar la agenda.",
            )}
            onRetry={() => void appointments.refetch()}
          />
        ) : (
          <div
            className={cx(
              "max-h-[70vh] overflow-y-auto transition-opacity",
              appointments.isFetching && "opacity-70",
            )}
            aria-busy={appointments.isFetching}
          >
            <WeekGrid
              days={days}
              hours={hours}
              appointments={visible}
              onSelect={setSelected}
              onCreate={canCreate ? openNew : undefined}
            />
          </div>
        )}
      </Card>
      {canCreate && (
        <p className="mt-3 text-xs text-ink-muted">
          Haz clic en un espacio libre de la agenda para agendar a esa hora.
        </p>
      )}

      <AppointmentDialog
        appointment={selected}
        canManage={canManage}
        onClose={() => setSelected(null)}
      />
      <NewAppointmentDialog draft={draft} onClose={() => setDraft(null)} />
    </>
  );
}
