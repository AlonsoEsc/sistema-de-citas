import { useMemo, type MouseEvent } from "react";
import { wallTimeToMinutes, zonedDateTime } from "@citas/shared/time";
import { cx } from "../../lib/cx";
import { useNow } from "../../lib/hooks";
import { useTenant } from "../../state/tenant";
import { STATUS_LABELS, type Appointment } from "./api";
import { placeInLanes } from "./layout";

const HOUR_PX = 64;
const SLOT_MINUTES = 15;

const blockTones: Record<Appointment["status"], string> = {
  pending: "border-warning bg-warning-soft",
  confirmed: "border-primary bg-primary-soft",
  completed: "border-success bg-success-soft",
  no_show: "border-danger bg-danger-soft",
  cancelled: "border-line bg-surface-muted opacity-60 line-through",
};

type Positioned = Appointment & {
  start: number;
  end: number;
  lane: number;
  lanes: number;
};

/**
 * Cuadricula de dias por horas. Cada cita se ubica por sus minutos reales en la zona del
 * negocio y las simultaneas (distinto personal) se reparten en carriles.
 */
export function WeekGrid({
  days,
  hours,
  appointments,
  onSelect,
  onCreate,
}: {
  days: string[];
  hours: { start: number; end: number };
  appointments: Appointment[];
  onSelect: (appointment: Appointment) => void;
  onCreate?: (date: string, time: string) => void;
}) {
  const { tenant, format } = useTenant();
  const now = useNow();
  const today = format.calendarDate(now);
  const nowMinute = wallTimeToMinutes(format.wallTime(now));
  const firstMinute = hours.start * 60;
  const totalMinutes = (hours.end - hours.start) * 60;
  const pxPerMinute = HOUR_PX / 60;

  const byDay = useMemo(() => {
    const map = new Map<string, Positioned[]>();
    for (const day of days) {
      const items = appointments
        .filter((item) => format.calendarDate(item.startAt) === day)
        .map((item) => {
          const start = wallTimeToMinutes(format.wallTime(item.startAt));
          const sameDayEnd = format.calendarDate(item.endAt) === day;
          const end = sameDayEnd
            ? wallTimeToMinutes(format.wallTime(item.endAt))
            : 24 * 60;
          return { ...item, start, end: Math.max(end, start + SLOT_MINUTES) };
        });
      const placed = new Map(
        placeInLanes(items).map((item) => [item.id, item]),
      );
      map.set(
        day,
        items.map((item) => ({
          ...item,
          lane: placed.get(item.id)!.lane,
          lanes: placed.get(item.id)!.lanes,
        })),
      );
    }
    return map;
  }, [appointments, days, format]);

  const hourLabel = (hour: number) =>
    new Intl.DateTimeFormat(tenant.locale, {
      hour: "numeric",
      timeZone: "UTC",
    }).format(Date.UTC(2000, 0, 1, hour));

  const handleCreate = (day: string) => (event: MouseEvent<HTMLDivElement>) => {
    if (!onCreate || event.target !== event.currentTarget) {
      return;
    }
    const offset = event.nativeEvent.offsetY / pxPerMinute;
    const minute =
      firstMinute + Math.floor(offset / SLOT_MINUTES) * SLOT_MINUTES;
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    onCreate(day, time);
  };

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-full"
        style={{
          gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(${days.length > 1 ? "7.5rem" : "0"}, 1fr))`,
        }}
      >
        <div className="sticky top-0 z-10 border-b border-line bg-surface" />
        {days.map((day) => (
          <div
            key={day}
            className={cx(
              "sticky top-0 z-10 border-b border-l border-line bg-surface px-2 py-2.5 text-center text-sm font-semibold capitalize",
              day === today ? "text-primary" : "text-ink",
            )}
          >
            {format.shortDay(zonedDateTime(day, "12:00", tenant.timezone))}
          </div>
        ))}

        <div
          className="relative"
          style={{ height: totalMinutes * pxPerMinute }}
        >
          {Array.from({ length: hours.end - hours.start }, (_, index) => (
            <span
              key={index}
              className="absolute right-2 -translate-y-1/2 text-[11px] text-ink-muted"
              style={{ top: index * HOUR_PX }}
            >
              {index === 0 ? "" : hourLabel(hours.start + index)}
            </span>
          ))}
        </div>

        {days.map((day) => (
          <div
            key={day}
            role={onCreate ? "button" : undefined}
            aria-label={onCreate ? `Agendar el ${day}` : undefined}
            tabIndex={-1}
            onClick={handleCreate(day)}
            className={cx(
              "relative border-l border-line",
              onCreate && "cursor-copy",
              day === today && "bg-primary-soft/30",
            )}
            style={{
              height: totalMinutes * pxPerMinute,
              backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0, var(--line) 1px, transparent 1px, transparent ${HOUR_PX}px)`,
            }}
          >
            {day === today &&
              nowMinute >= firstMinute &&
              nowMinute <= firstMinute + totalMinutes && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-[5] h-0.5 bg-danger"
                  style={{ top: (nowMinute - firstMinute) * pxPerMinute }}
                />
              )}
            {(byDay.get(day) ?? []).map((item) => {
              const top = Math.max(0, item.start - firstMinute) * pxPerMinute;
              const height = Math.max(
                (item.end - Math.max(item.start, firstMinute)) * pxPerMinute -
                  2,
                18,
              );
              const services = item.services
                .map((line) => line.service.name)
                .join(", ");
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  title={`${format.time(item.startAt)} · ${item.customer.fullName} · ${services} · ${STATUS_LABELS[item.status]}`}
                  className={cx(
                    "absolute overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs text-ink shadow-sm transition hover:z-10 hover:shadow-md",
                    blockTones[item.status],
                  )}
                  style={{
                    top,
                    height,
                    left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / item.lanes}% - 4px)`,
                  }}
                >
                  <span className="block truncate font-semibold">
                    {item.customer.fullName}
                  </span>
                  <span className="block truncate text-ink-muted">
                    {format.time(item.startAt)} · {services}
                  </span>
                  <span className="block truncate text-ink-muted">
                    {item.staff.displayName}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
