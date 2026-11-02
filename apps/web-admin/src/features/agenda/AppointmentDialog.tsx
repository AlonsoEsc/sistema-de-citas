import { useState } from "react";
import { CalendarClock, Mail, Phone, Trash2 } from "lucide-react";
import { zonedDateTime } from "@citas/shared/time";
import { Button } from "../../components/ui/button";
import { ConfirmDialog, Dialog } from "../../components/ui/dialog";
import { Field } from "../../components/ui/form";
import { Badge } from "../../components/ui/surface";
import { useTenant } from "../../state/tenant";
import {
  HISTORICAL_STATUSES,
  STATUS_LABELS,
  STATUS_TONES,
  useDeleteAppointment,
  useReschedule,
  useUpdateStatus,
  type Appointment,
  type AppointmentStatus,
} from "./api";

const SOURCE_LABELS: Record<Appointment["source"], string> = {
  admin: "Panel",
  portal: "Portal de reservas",
  whatsapp: "WhatsApp",
};

/** Acciones que tienen sentido desde cada estado. */
const NEXT_STATUSES: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "no_show", "cancelled"],
  completed: [],
  no_show: [],
  cancelled: ["confirmed"],
};

const ACTION_LABELS: Record<AppointmentStatus, string> = {
  pending: "Marcar pendiente",
  confirmed: "Confirmar",
  completed: "Completada",
  no_show: "No asistió",
  cancelled: "Cancelar cita",
};

export function AppointmentDialog({
  appointment,
  canManage,
  onClose,
}: {
  appointment: Appointment | null;
  canManage: boolean;
  onClose: () => void;
}) {
  const { tenant, terms, format, readOnly } = useTenant();
  const updateStatus = useUpdateStatus();
  const reschedule = useReschedule();
  const remove = useDeleteAppointment();
  const [notify, setNotify] = useState(true);
  const [rescheduling, setRescheduling] = useState<{
    date: string;
    time: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shownId, setShownId] = useState<string | null>(null);

  if ((appointment?.id ?? null) !== shownId) {
    setShownId(appointment?.id ?? null);
    setRescheduling(null);
    setNotify(true);
  }
  if (!appointment) {
    return null;
  }

  const editable = canManage && !readOnly;
  const historical = HISTORICAL_STATUSES.includes(appointment.status);
  const services = appointment.services.map((line) => line.service.name);

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={appointment.customer.fullName}
        description={format.dateTime(appointment.startAt)}
        footer={
          editable && !historical ? (
            <Button
              variant="ghost"
              className="mr-auto text-danger hover:bg-danger-soft hover:text-danger"
              icon={<Trash2 className="size-4" />}
              onClick={() => setConfirmDelete(true)}
            >
              Eliminar
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONES[appointment.status]}>
              {STATUS_LABELS[appointment.status]}
            </Badge>
            <Badge>Origen: {SOURCE_LABELS[appointment.source]}</Badge>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-ink-muted">{terms.services}</dt>
            <dd>{services.join(", ")}</dd>
            <dt className="text-ink-muted">{terms.staffMember}</dt>
            <dd>{appointment.staff.displayName}</dd>
            <dt className="text-ink-muted">Horario</dt>
            <dd>
              {format.time(appointment.startAt)} –{" "}
              {format.time(appointment.endAt)}
            </dd>
            <dt className="text-ink-muted">Precio</dt>
            <dd>{format.money(appointment.priceCents)}</dd>
            <dt className="text-ink-muted">Contacto</dt>
            <dd className="space-y-1">
              {appointment.customer.phone && (
                <a
                  href={`tel:${appointment.customer.phone}`}
                  className="flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Phone className="size-3.5" /> {appointment.customer.phone}
                </a>
              )}
              {appointment.customer.email && (
                <a
                  href={`mailto:${appointment.customer.email}`}
                  className="flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Mail className="size-3.5" /> {appointment.customer.email}
                </a>
              )}
              {!appointment.customer.phone && !appointment.customer.email && (
                <span className="text-ink-muted">Sin datos de contacto</span>
              )}
            </dd>
          </dl>

          {editable && (
            <section className="space-y-3 border-t border-line pt-4">
              <label className="flex items-center gap-2 text-ink-muted">
                <input
                  type="checkbox"
                  className="accent-[var(--primary)]"
                  checked={notify}
                  onChange={(event) => setNotify(event.target.checked)}
                />
                Avisar al {terms.customer.toLowerCase()} del cambio
              </label>

              {NEXT_STATUSES[appointment.status].length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {NEXT_STATUSES[appointment.status].map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={
                        status === "cancelled" || status === "no_show"
                          ? "secondary"
                          : "primary"
                      }
                      loading={
                        updateStatus.isPending &&
                        updateStatus.variables?.status === status
                      }
                      onClick={() =>
                        updateStatus.mutate(
                          {
                            id: appointment.id,
                            status,
                            suppressNotifications: !notify,
                          },
                          { onSuccess: onClose },
                        )
                      }
                    >
                      {ACTION_LABELS[status]}
                    </Button>
                  ))}
                </div>
              )}

              {!historical &&
                appointment.status !== "cancelled" &&
                (rescheduling ? (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      reschedule.mutate(
                        {
                          id: appointment.id,
                          startAt: zonedDateTime(
                            rescheduling.date,
                            rescheduling.time,
                            tenant.timezone,
                          ).toISOString(),
                        },
                        { onSuccess: onClose },
                      );
                    }}
                  >
                    <Field
                      label="Nueva fecha"
                      type="date"
                      required
                      value={rescheduling.date}
                      onChange={(event) =>
                        setRescheduling({
                          ...rescheduling,
                          date: event.target.value,
                        })
                      }
                    />
                    <Field
                      label="Hora"
                      type="time"
                      step={300}
                      required
                      value={rescheduling.time}
                      onChange={(event) =>
                        setRescheduling({
                          ...rescheduling,
                          time: event.target.value,
                        })
                      }
                    />
                    <Button type="submit" loading={reschedule.isPending}>
                      Guardar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setRescheduling(null)}
                    >
                      Cancelar
                    </Button>
                  </form>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<CalendarClock className="size-4" />}
                    onClick={() =>
                      setRescheduling({
                        date: format.calendarDate(appointment.startAt),
                        time: format.wallTime(appointment.startAt),
                      })
                    }
                  >
                    Reprogramar
                  </Button>
                ))}
            </section>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar cita"
        message="Se borra de la agenda sin avisar al cliente. Si solo no se realizará, es mejor cancelarla para conservar el historial."
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(appointment.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              onClose();
            },
          })
        }
      />
    </>
  );
}
