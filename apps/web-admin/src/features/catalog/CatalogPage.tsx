import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Clock, Pencil, Plus, Scissors, UserRound } from "lucide-react";
import { PERMISSIONS } from "@citas/shared/access";
import { Button, IconButton } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Field, Switch } from "../../components/ui/form";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from "../../components/ui/surface";
import { Tabs } from "../../components/ui/tabs";
import { apiErrorMessage } from "../../lib/errors";
import { initials } from "../../lib/format";
import { useAuth } from "../../state/auth";
import { useTenant } from "../../state/tenant";
import {
  useAllSchedules,
  useSaveService,
  useSaveStaff,
  useServices,
  useStaff,
  type ScheduleSegment,
  type Service,
  type Staff,
} from "./api";
import { ScheduleDialog } from "./ScheduleDialog";
import { scheduleSummary } from "./schedule";

function StaffDialog({
  staff,
  open,
  onClose,
}: {
  staff: Staff | null;
  open: boolean;
  onClose: () => void;
}) {
  const { terms } = useTenant();
  const save = useSaveStaff();
  const [form, setForm] = useState({
    displayName: "",
    phone: "",
    active: true,
  });
  const [loadedFor, setLoadedFor] = useState<Staff | null | undefined>();

  if (open && loadedFor !== staff) {
    setLoadedFor(staff);
    setForm({
      displayName: staff?.displayName ?? "",
      phone: staff?.phone ?? "",
      active: staff?.active ?? true,
    });
  }
  const close = () => {
    setLoadedFor(undefined);
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      {
        id: staff?.id,
        displayName: form.displayName,
        phone: form.phone || undefined,
        active: form.active,
      },
      { onSuccess: close },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={
        staff
          ? `Editar ${terms.staffMember.toLowerCase()}`
          : `Agregar ${terms.staffMember.toLowerCase()}`
      }
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" form="staff-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={submit} className="space-y-4">
        <Field
          label="Nombre visible"
          hint="Así lo verán tus clientes al reservar."
          required
          minLength={2}
          value={form.displayName}
          onChange={(event) =>
            setForm({ ...form, displayName: event.target.value })
          }
        />
        <Field
          label="Teléfono"
          type="tel"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
        />
        {staff && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <div>
              <p className="text-sm font-medium">Activo</p>
              <p className="text-xs text-ink-muted">
                Si lo desactivas, deja de aparecer en el portal y no cuenta para
                tu plan.
              </p>
            </div>
            <Switch
              label="Activo"
              checked={form.active}
              onChange={(active) => setForm({ ...form, active })}
            />
          </div>
        )}
      </form>
    </Dialog>
  );
}

function StaffSection({ canManage }: { canManage: boolean }) {
  const { terms, limits } = useTenant();
  const staff = useStaff();
  const schedules = useAllSchedules(staff.data);
  const [editing, setEditing] = useState<{ staff: Staff | null } | null>(null);
  const [scheduling, setScheduling] = useState<Staff | null>(null);

  const activeCount = (staff.data ?? []).filter((item) => item.active).length;
  const atLimit = activeCount >= limits.maxStaff;
  const scheduleOf = (staffId: string): ScheduleSegment[] =>
    (schedules.data ?? []).filter((segment) => segment.staffId === staffId);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <p className="text-sm text-ink-muted">
          {activeCount} de {limits.maxStaff} {terms.staff.toLowerCase()} activos
          incluidos en tu plan
        </p>
        {canManage && (
          <Button
            icon={<Plus className="size-4" />}
            disabled={atLimit}
            title={
              atLimit ? "Tu plan no permite más personal activo" : undefined
            }
            onClick={() => setEditing({ staff: null })}
          >
            Agregar {terms.staffMember.toLowerCase()}
          </Button>
        )}
      </div>
      {staff.isError ? (
        <ErrorState
          message={apiErrorMessage(staff.error, "No se pudo cargar el equipo.")}
          onRetry={() => void staff.refetch()}
        />
      ) : staff.isLoading ? (
        <LoadingRows />
      ) : (staff.data ?? []).length === 0 ? (
        <EmptyState
          icon={<UserRound className="size-5" />}
          title={`Agrega a tu primer ${terms.staffMember.toLowerCase()}`}
          description="Cada persona tiene su propia agenda y horario."
        />
      ) : (
        <ul className="divide-y divide-line">
          {(staff.data ?? []).map((item) => {
            const summary = scheduleSummary(scheduleOf(item.id));
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-4 px-5 py-4"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">
                  {initials(item.displayName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    {item.displayName}
                    {!item.active && <Badge>Inactivo</Badge>}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <Clock className="size-3.5" />
                    {summary || (
                      <span className="text-warning">
                        Sin horario: no recibe reservas
                      </span>
                    )}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setScheduling(item)}
                    >
                      Horario
                    </Button>
                    <IconButton
                      label={`Editar a ${item.displayName}`}
                      onClick={() => setEditing({ staff: item })}
                    >
                      <Pencil className="size-4" />
                    </IconButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <StaffDialog
        open={Boolean(editing)}
        staff={editing?.staff ?? null}
        onClose={() => setEditing(null)}
      />
      <ScheduleDialog staff={scheduling} onClose={() => setScheduling(null)} />
    </Card>
  );
}

function ServiceDialog({
  service,
  open,
  onClose,
}: {
  service: Service | null;
  open: boolean;
  onClose: () => void;
}) {
  const { terms, tenant } = useTenant();
  const save = useSaveService();
  const [form, setForm] = useState({
    name: "",
    duration: "30",
    price: "",
    active: true,
  });
  const [loadedFor, setLoadedFor] = useState<Service | null | undefined>();

  if (open && loadedFor !== service) {
    setLoadedFor(service);
    setForm({
      name: service?.name ?? "",
      duration: String(service?.durationMinutes ?? 30),
      price: service ? (service.priceCents / 100).toFixed(2) : "",
      active: service?.active ?? true,
    });
  }
  const close = () => {
    setLoadedFor(undefined);
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      {
        id: service?.id,
        name: form.name,
        durationMinutes: Number(form.duration),
        priceCents: Math.round(Number(form.price) * 100),
        active: form.active,
      },
      { onSuccess: close },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={
        service
          ? `Editar ${terms.service.toLowerCase()}`
          : `Nuevo ${terms.service.toLowerCase()}`
      }
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" form="service-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="service-form" onSubmit={submit} className="space-y-4">
        <Field
          label="Nombre"
          required
          minLength={2}
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Duración (minutos)"
            type="number"
            min={5}
            max={480}
            step={5}
            required
            value={form.duration}
            onChange={(event) =>
              setForm({ ...form, duration: event.target.value })
            }
          />
          <Field
            label={`Precio (${tenant.currency})`}
            type="number"
            min={0}
            step="0.01"
            required
            value={form.price}
            onChange={(event) =>
              setForm({ ...form, price: event.target.value })
            }
          />
        </div>
        {service && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <div>
              <p className="text-sm font-medium">Disponible para reservar</p>
              <p className="text-xs text-ink-muted">
                Las citas ya agendadas no cambian.
              </p>
            </div>
            <Switch
              label="Disponible para reservar"
              checked={form.active}
              onChange={(active) => setForm({ ...form, active })}
            />
          </div>
        )}
      </form>
    </Dialog>
  );
}

function ServicesSection({ canManage }: { canManage: boolean }) {
  const { terms, format } = useTenant();
  const services = useServices();
  const [editing, setEditing] = useState<{ service: Service | null } | null>(
    null,
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <p className="text-sm text-ink-muted">
          Lo que tus {terms.customers.toLowerCase()} pueden reservar, con su
          duración y precio.
        </p>
        {canManage && (
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => setEditing({ service: null })}
          >
            Nuevo {terms.service.toLowerCase()}
          </Button>
        )}
      </div>
      {services.isError ? (
        <ErrorState
          message={apiErrorMessage(
            services.error,
            "No se pudo cargar la lista.",
          )}
          onRetry={() => void services.refetch()}
        />
      ) : services.isLoading ? (
        <LoadingRows />
      ) : (services.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Scissors className="size-5" />}
          title={`Agrega tu primer ${terms.service.toLowerCase()}`}
        />
      ) : (
        <ul className="divide-y divide-line">
          {(services.data ?? []).map((service) => (
            <li
              key={service.id}
              className="flex items-center gap-4 px-5 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {service.name}
                  {!service.active && <Badge>No disponible</Badge>}
                </p>
                <p className="text-xs text-ink-muted">
                  {service.durationMinutes} min
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {format.money(service.priceCents)}
              </span>
              {canManage && (
                <IconButton
                  label={`Editar ${service.name}`}
                  onClick={() => setEditing({ service })}
                >
                  <Pencil className="size-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <ServiceDialog
        open={Boolean(editing)}
        service={editing?.service ?? null}
        onClose={() => setEditing(null)}
      />
    </Card>
  );
}

type CatalogTab = "equipo" | "servicios";

export function CatalogPage() {
  const { terms, readOnly } = useTenant();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: CatalogTab =
    params.get("tab") === "servicios" ? "servicios" : "equipo";

  return (
    <>
      <PageHeader
        title={`${terms.services} y equipo`}
        description="Quién atiende, cuándo atiende y qué se puede reservar."
      />
      <Tabs
        label="Secciones del catálogo"
        value={tab}
        onChange={(value) =>
          setParams(value === "equipo" ? {} : { tab: value })
        }
        tabs={[
          { value: "equipo", label: terms.staff },
          { value: "servicios", label: terms.services },
        ]}
      />
      {tab === "equipo" ? (
        <StaffSection canManage={can(PERMISSIONS.staffManage) && !readOnly} />
      ) : (
        <ServicesSection
          canManage={can(PERMISSIONS.servicesManage) && !readOnly}
        />
      )}
    </>
  );
}
