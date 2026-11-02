import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, IconButton } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Alert, Switch } from "../../components/ui/form";
import { LoadingRows } from "../../components/ui/surface";
import { useSaveSchedule, useStaffSchedule, type Staff } from "./api";
import {
  DAY_NAMES,
  WEEK_ORDER,
  fromWeekForm,
  scheduleProblem,
  toWeekForm,
  type DayForm,
} from "./schedule";

const timeInput =
  "h-9 w-[6.5rem] rounded-lg border border-line bg-surface px-2 text-sm text-ink disabled:opacity-40";

function ScheduleForm({
  staff,
  initial,
  onClose,
}: {
  staff: Staff;
  initial: DayForm[];
  onClose: () => void;
}) {
  const [days, setDays] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSaveSchedule(staff.id);

  const update = (day: number, patch: Partial<DayForm>) =>
    setDays((current) =>
      current.map((item, index) =>
        index === day ? { ...item, ...patch } : item,
      ),
    );

  const copyToWeekdays = (source: number) =>
    setDays((current) =>
      current.map((item, index) =>
        index >= 1 && index <= 5
          ? { ...current[source], breaks: [...current[source].breaks] }
          : item,
      ),
    );

  const submit = () => {
    const issue = scheduleProblem(days);
    setProblem(issue);
    if (!issue) {
      save.mutate(fromWeekForm(days), { onSuccess: onClose });
    }
  };

  return (
    <>
      <div className="space-y-1">
        {problem && <Alert tone="error">{problem}</Alert>}
        {WEEK_ORDER.map((dayOfWeek) => {
          const day = days[dayOfWeek];
          const name = DAY_NAMES[dayOfWeek];
          return (
            <div
              key={dayOfWeek}
              className="border-b border-line py-3 last:border-0"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Switch
                  label={`Atiende el ${name.toLowerCase()}`}
                  checked={day.enabled}
                  onChange={(enabled) => update(dayOfWeek, { enabled })}
                />
                <span className="w-24 text-sm font-medium">{name}</span>
                {day.enabled ? (
                  <>
                    <input
                      type="time"
                      aria-label={`${name}: entrada`}
                      className={timeInput}
                      value={day.start}
                      onChange={(event) =>
                        update(dayOfWeek, { start: event.target.value })
                      }
                    />
                    <span className="text-ink-muted">a</span>
                    <input
                      type="time"
                      aria-label={`${name}: salida`}
                      className={timeInput}
                      value={day.end}
                      onChange={(event) =>
                        update(dayOfWeek, { end: event.target.value })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Plus className="size-3.5" />}
                      onClick={() =>
                        update(dayOfWeek, {
                          breaks: [
                            ...day.breaks,
                            { start: "13:00", end: "14:00" },
                          ],
                        })
                      }
                    >
                      Descanso
                    </Button>
                    {dayOfWeek === 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToWeekdays(1)}
                      >
                        Copiar a lun–vie
                      </Button>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-ink-muted">No atiende</span>
                )}
              </div>
              {day.enabled &&
                day.breaks.map((item, index) => (
                  <div
                    key={index}
                    className="mt-2 flex items-center gap-3 pl-[8.5rem]"
                  >
                    <span className="text-xs text-ink-muted">Descanso</span>
                    <input
                      type="time"
                      aria-label={`${name}: inicio del descanso ${index + 1}`}
                      className={timeInput}
                      value={item.start}
                      onChange={(event) =>
                        update(dayOfWeek, {
                          breaks: day.breaks.map((current, position) =>
                            position === index
                              ? { ...current, start: event.target.value }
                              : current,
                          ),
                        })
                      }
                    />
                    <span className="text-ink-muted">a</span>
                    <input
                      type="time"
                      aria-label={`${name}: fin del descanso ${index + 1}`}
                      className={timeInput}
                      value={item.end}
                      onChange={(event) =>
                        update(dayOfWeek, {
                          breaks: day.breaks.map((current, position) =>
                            position === index
                              ? { ...current, end: event.target.value }
                              : current,
                          ),
                        })
                      }
                    />
                    <IconButton
                      label="Quitar descanso"
                      onClick={() =>
                        update(dayOfWeek, {
                          breaks: day.breaks.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                    >
                      <X className="size-4" />
                    </IconButton>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button loading={save.isPending} onClick={submit}>
          Guardar horario
        </Button>
      </div>
    </>
  );
}

/** Horario semanal de un profesional: define los espacios que ve el portal de reservas. */
export function ScheduleDialog({
  staff,
  onClose,
}: {
  staff: Staff | null;
  onClose: () => void;
}) {
  const schedule = useStaffSchedule(staff?.id);
  return (
    <Dialog
      open={Boolean(staff)}
      onClose={onClose}
      title={`Horario de ${staff?.displayName ?? ""}`}
      description="Los clientes solo pueden reservar dentro de estos horarios."
      size="lg"
    >
      {staff && schedule.data ? (
        <ScheduleForm
          key={staff.id}
          staff={staff}
          initial={toWeekForm(schedule.data)}
          onClose={onClose}
        />
      ) : (
        <LoadingRows rows={4} />
      )}
    </Dialog>
  );
}
