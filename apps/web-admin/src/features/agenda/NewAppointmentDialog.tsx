import { useState, type FormEvent } from "react";
import { zonedDateTime } from "@citas/shared/time";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Alert, Field, SelectField } from "../../components/ui/form";
import { cx } from "../../lib/cx";
import { useDebounced } from "../../lib/hooks";
import { useTenant } from "../../state/tenant";
import { useServices, useStaff } from "../catalog/api";
import { useCustomers, type Customer } from "../customers/api";
import { useCreateAppointment } from "./api";

type Draft = { date: string; time: string };

function CustomerPicker({
  selected,
  onSelect,
}: {
  selected: Customer | null;
  onSelect: (customer: Customer | null) => void;
}) {
  const { terms } = useTenant();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim());
  const results = useCustomers(debounced);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-muted px-3.5 py-2.5 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium">{selected.fullName}</p>
          <p className="truncate text-xs text-ink-muted">
            {selected.phone ?? selected.email ?? "Sin contacto"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
          Cambiar
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Field
        label={`Buscar ${terms.customer.toLowerCase()}`}
        placeholder="Nombre, teléfono o correo"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {debounced && (
        <ul className="max-h-40 overflow-y-auto rounded-xl border border-line">
          {(results.data ?? []).slice(0, 8).map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => onSelect(customer)}
                className="flex w-full justify-between gap-3 px-3.5 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <span className="truncate">{customer.fullName}</span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {customer.phone ?? customer.email}
                </span>
              </button>
            </li>
          ))}
          {results.data?.length === 0 && (
            <li className="px-3.5 py-2 text-sm text-ink-muted">
              Sin resultados.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Agenda una cita desde el panel: el negocio puede agendar fuera de la jornada publica. */
export function NewAppointmentDialog({
  draft,
  onClose,
}: {
  draft: Draft | null;
  onClose: () => void;
}) {
  const { tenant, terms, format } = useTenant();
  const staff = useStaff();
  const services = useServices();
  const create = useCreateAppointment();

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    fullName: "",
    phone: "",
    email: "",
  });
  const [staffId, setStaffId] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [when, setWhen] = useState<Draft>({ date: "", time: "" });
  const [problem, setProblem] = useState("");
  const [openedFor, setOpenedFor] = useState<Draft | null>(null);

  // Reinicia el formulario cada vez que se abre para un horario distinto.
  if (draft && draft !== openedFor) {
    setOpenedFor(draft);
    setWhen(draft);
    setCustomer(null);
    setMode("existing");
    setNewCustomer({ fullName: "", phone: "", email: "" });
    setServiceIds([]);
    setProblem("");
  }

  const activeStaff = (staff.data ?? []).filter((item) => item.active);
  const activeServices = (services.data ?? []).filter((item) => item.active);
  const chosen = activeServices.filter((item) => serviceIds.includes(item.id));
  const totalMinutes = chosen.reduce(
    (sum, item) => sum + item.durationMinutes,
    0,
  );
  const totalCents = chosen.reduce((sum, item) => sum + item.priceCents, 0);
  const selectedStaff = staffId || activeStaff[0]?.id || "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "existing" && !customer) {
      setProblem(`Elige un ${terms.customer.toLowerCase()} o crea uno nuevo.`);
      return;
    }
    if (serviceIds.length === 0) {
      setProblem(`Marca qué ${terms.services.toLowerCase()} incluye la cita.`);
      return;
    }
    setProblem("");
    create.mutate(
      {
        staffId: selectedStaff,
        serviceIds,
        startAt: zonedDateTime(
          when.date,
          when.time,
          tenant.timezone,
        ).toISOString(),
        ...(mode === "existing"
          ? { customerId: customer!.id }
          : {
              customer: {
                fullName: newCustomer.fullName,
                phone: newCustomer.phone || undefined,
                email: newCustomer.email || undefined,
              },
            }),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog
      open={Boolean(draft)}
      onClose={onClose}
      title={`Nueva ${terms.appointment.toLowerCase()}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="new-appointment"
            loading={create.isPending}
          >
            Agendar
          </Button>
        </>
      }
    >
      <form id="new-appointment" onSubmit={submit} className="space-y-5">
        {problem && <Alert tone="error">{problem}</Alert>}

        <fieldset className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <legend className="text-sm font-semibold">{terms.customer}</legend>
            <div className="flex rounded-lg bg-surface-muted p-0.5 text-xs font-medium">
              {(["existing", "new"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={cx(
                    "rounded-md px-3 py-1",
                    mode === value
                      ? "bg-surface text-ink shadow-sm"
                      : "text-ink-muted",
                  )}
                >
                  {value === "existing" ? "Existente" : "Nuevo"}
                </button>
              ))}
            </div>
          </div>
          {mode === "existing" ? (
            <CustomerPicker selected={customer} onSelect={setCustomer} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Nombre completo"
                required
                minLength={2}
                value={newCustomer.fullName}
                onChange={(event) =>
                  setNewCustomer({
                    ...newCustomer,
                    fullName: event.target.value,
                  })
                }
              />
              <Field
                label="Teléfono"
                type="tel"
                placeholder="+503 7000 0000"
                value={newCustomer.phone}
                onChange={(event) =>
                  setNewCustomer({ ...newCustomer, phone: event.target.value })
                }
              />
              <Field
                label="Correo"
                type="email"
                value={newCustomer.email}
                onChange={(event) =>
                  setNewCustomer({ ...newCustomer, email: event.target.value })
                }
              />
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">
            {terms.services}
          </legend>
          {activeServices.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No hay {terms.services.toLowerCase()} disponibles para reservar.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {activeServices.map((service) => (
                <label
                  key={service.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--primary)]"
                    checked={serviceIds.includes(service.id)}
                    onChange={(event) =>
                      setServiceIds((current) =>
                        event.target.checked
                          ? [...current, service.id]
                          : current.filter((id) => id !== service.id),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {service.name}
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {service.durationMinutes} min ·{" "}
                    {format.money(service.priceCents)}
                  </span>
                </label>
              ))}
            </div>
          )}
          {chosen.length > 0 && (
            <p className="text-xs text-ink-muted">
              Total: {totalMinutes} min · {format.money(totalCents)}
            </p>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField
            label={terms.staffMember}
            value={selectedStaff}
            onChange={(event) => setStaffId(event.target.value)}
            required
          >
            {activeStaff.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </SelectField>
          <Field
            label="Fecha"
            type="date"
            required
            value={when.date}
            onChange={(event) => setWhen({ ...when, date: event.target.value })}
          />
          <Field
            label="Hora"
            type="time"
            step={300}
            required
            value={when.time}
            onChange={(event) => setWhen({ ...when, time: event.target.value })}
          />
        </div>
      </form>
    </Dialog>
  );
}
