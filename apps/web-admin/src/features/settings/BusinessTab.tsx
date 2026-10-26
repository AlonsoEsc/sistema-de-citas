import { useState, type FormEvent } from "react";
import { INDUSTRIES } from "@citas/shared/industries";
import { Button } from "../../components/ui/button";
import { Alert, Field, SelectField } from "../../components/ui/form";
import { Card, CardHeader } from "../../components/ui/surface";
import { useTenant } from "../../state/tenant";
import { useSaveBusiness } from "./api";

/** Zonas y monedas de la region; si el negocio usa otra, se conserva como opcion. */
const TIMEZONES = [
  ["America/El_Salvador", "El Salvador"],
  ["America/Guatemala", "Guatemala"],
  ["America/Tegucigalpa", "Honduras"],
  ["America/Managua", "Nicaragua"],
  ["America/Costa_Rica", "Costa Rica"],
  ["America/Panama", "Panamá"],
  ["America/Mexico_City", "México (centro)"],
  ["America/Bogota", "Colombia"],
  ["America/Lima", "Perú"],
  ["America/Santo_Domingo", "República Dominicana"],
  ["America/New_York", "EE. UU. (este)"],
  ["America/Los_Angeles", "EE. UU. (pacífico)"],
];

const CURRENCIES = [
  ["USD", "Dólar estadounidense (USD)"],
  ["GTQ", "Quetzal (GTQ)"],
  ["HNL", "Lempira (HNL)"],
  ["NIO", "Córdoba (NIO)"],
  ["CRC", "Colón costarricense (CRC)"],
  ["MXN", "Peso mexicano (MXN)"],
  ["COP", "Peso colombiano (COP)"],
  ["PEN", "Sol (PEN)"],
  ["DOP", "Peso dominicano (DOP)"],
];

const CANCEL_OPTIONS = [0, 60, 120, 240, 720, 1440, 2880];

function withCurrent(options: string[][], current: string) {
  return options.some(([value]) => value === current)
    ? options
    : [[current, current], ...options];
}

function hoursLabel(minutes: number) {
  if (minutes === 0) {
    return "Hasta el momento de la cita";
  }
  const hours = minutes / 60;
  return hours >= 24
    ? `Hasta ${hours / 24} ${hours / 24 === 1 ? "día" : "días"} antes`
    : `Hasta ${hours} ${hours === 1 ? "hora" : "horas"} antes`;
}

export function BusinessTab() {
  const { tenant, readOnly } = useTenant();
  const save = useSaveBusiness();
  const [form, setForm] = useState({
    name: tenant.name,
    industry: tenant.industry as string,
    timezone: tenant.timezone,
    currency: tenant.currency,
    cancelPolicyMinutes: tenant.settings?.cancelPolicyMinutes ?? 120,
    bookingWindowDays: tenant.settings?.bookingWindowDays ?? 30,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({
      profile: {
        name: form.name,
        industry: form.industry,
        timezone: form.timezone,
        currency: form.currency,
      },
      settings: {
        cancelPolicyMinutes: form.cancelPolicyMinutes,
        bookingWindowDays: form.bookingWindowDays,
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader
          title="Perfil del negocio"
          description="Así te ven tus clientes en el portal y en los mensajes."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field
            label="Nombre del negocio"
            required
            minLength={2}
            maxLength={80}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <SelectField
            label="Rubro"
            value={form.industry}
            onChange={(event) =>
              setForm({ ...form, industry: event.target.value })
            }
          >
            {INDUSTRIES.map((industry) => (
              <option key={industry.code} value={industry.code}>
                {industry.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Zona horaria"
            value={form.timezone}
            onChange={(event) =>
              setForm({ ...form, timezone: event.target.value })
            }
          >
            {withCurrent(TIMEZONES, tenant.timezone).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Moneda"
            value={form.currency}
            onChange={(event) =>
              setForm({ ...form, currency: event.target.value })
            }
          >
            {withCurrent(CURRENCIES, tenant.currency).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>
        {form.industry !== tenant.industry && (
          <div className="px-5 pb-5">
            <Alert tone="info">
              El rubro cambia los nombres del panel (por ejemplo, “Pacientes” en
              lugar de “Clientes”). No modifica tus servicios ni tus datos.
            </Alert>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Reglas de reserva"
          description="Se aplican en el portal y en WhatsApp."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <SelectField
            label="Los clientes pueden cancelar"
            value={form.cancelPolicyMinutes}
            onChange={(event) =>
              setForm({
                ...form,
                cancelPolicyMinutes: Number(event.target.value),
              })
            }
          >
            {[...new Set([...CANCEL_OPTIONS, form.cancelPolicyMinutes])]
              .sort((a, b) => a - b)
              .map((minutes) => (
                <option key={minutes} value={minutes}>
                  {hoursLabel(minutes)}
                </option>
              ))}
          </SelectField>
          <Field
            label="Reservas con anticipación de hasta (días)"
            type="number"
            min={1}
            max={365}
            required
            value={form.bookingWindowDays}
            onChange={(event) =>
              setForm({
                ...form,
                bookingWindowDays: Number(event.target.value),
              })
            }
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending} disabled={readOnly}>
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}
