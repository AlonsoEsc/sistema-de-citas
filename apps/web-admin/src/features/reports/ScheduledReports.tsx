import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { ENTITLEMENTS } from "@citas/shared/billing";
import { Button, IconButton } from "../../components/ui/button";
import { ConfirmDialog, Dialog } from "../../components/ui/dialog";
import { Alert, Field, SelectField, Switch } from "../../components/ui/form";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LoadingRows,
} from "../../components/ui/surface";
import { useTenant } from "../../state/tenant";
import {
  useDeleteScheduledReport,
  useSaveScheduledReport,
  useScheduledReports,
  type ScheduledReport,
} from "./api";

const FREQUENCY_LABELS: Record<ScheduledReport["frequency"], string> = {
  daily: "Diario (día anterior)",
  weekly: "Semanal (lunes, semana anterior)",
  monthly: "Mensual (día 1, mes anterior)",
};

const CHANNEL_HINTS: Record<ScheduledReport["channel"], string> = {
  email:
    "Resumen en el correo y el detalle en un archivo CSV (se abre en Excel o Google Sheets).",
  whatsapp:
    "Resumen en texto por WhatsApp. Cuenta para el cupo mensual de mensajes de tu plan.",
};

type FormState = {
  name: string;
  frequency: ScheduledReport["frequency"];
  channel: ScheduledReport["channel"];
  recipients: string;
};

function ReportDialog({
  report,
  open,
  onClose,
}: {
  report: ScheduledReport | null;
  open: boolean;
  onClose: () => void;
}) {
  const save = useSaveScheduledReport();
  const [form, setForm] = useState<FormState>({
    name: "",
    frequency: "weekly",
    channel: "email",
    recipients: "",
  });
  const [loadedFor, setLoadedFor] = useState<
    ScheduledReport | null | undefined
  >();
  if (open && loadedFor !== report) {
    setLoadedFor(report);
    setForm({
      name: report?.name ?? "Resumen semanal",
      frequency: report?.frequency ?? "weekly",
      channel: report?.channel ?? "email",
      recipients: report?.recipients.join(", ") ?? "",
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
        id: report?.id,
        name: form.name,
        frequency: form.frequency,
        channel: form.channel,
        recipients: form.recipients
          .split(/[,;\n]/)
          .map((item) => item.trim())
          .filter(Boolean),
      },
      { onSuccess: close },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={report ? "Editar reporte programado" : "Nuevo reporte programado"}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" form="report-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="report-form" onSubmit={submit} className="space-y-4">
        <Field
          label="Nombre"
          required
          minLength={2}
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <SelectField
          label="Frecuencia"
          value={form.frequency}
          onChange={(event) =>
            setForm({
              ...form,
              frequency: event.target.value as FormState["frequency"],
            })
          }
        >
          {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Enviar por"
          value={form.channel}
          onChange={(event) =>
            setForm({
              ...form,
              channel: event.target.value as FormState["channel"],
            })
          }
        >
          <option value="email">Correo electrónico</option>
          <option value="whatsapp">WhatsApp</option>
        </SelectField>
        <p className="text-xs text-ink-muted">{CHANNEL_HINTS[form.channel]}</p>
        <Field
          label={form.channel === "email" ? "Correos" : "Teléfonos"}
          hint="Separa varios con comas."
          required
          value={form.recipients}
          onChange={(event) =>
            setForm({ ...form, recipients: event.target.value })
          }
        />
        <p className="text-xs text-ink-muted">
          Se envía a las 07:00, hora de tu negocio.
        </p>
      </form>
    </Dialog>
  );
}

/** Reportes que el sistema envia solo (requiere un plan con reportes avanzados). */
export function ScheduledReports({ canManage }: { canManage: boolean }) {
  const { hasFeature, format } = useTenant();
  const enabled = hasFeature(ENTITLEMENTS.advancedReports);
  const reports = useScheduledReports();
  const save = useSaveScheduledReport();
  const remove = useDeleteScheduledReport();
  const [editing, setEditing] = useState<{
    report: ScheduledReport | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<ScheduledReport | null>(null);

  return (
    <Card>
      <CardHeader
        title="Reportes programados"
        description="Recibe el resumen del negocio sin entrar al panel."
        actions={
          canManage &&
          enabled && (
            <Button
              size="sm"
              icon={<Plus className="size-4" />}
              onClick={() => setEditing({ report: null })}
            >
              Programar
            </Button>
          )
        }
      />
      {!enabled && (
        <div className="p-5">
          <Alert tone="info">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-4" /> Los reportes programados están en los
              planes Negocio y Clínica.{" "}
              <Link to="/ajustes/plan" className="font-semibold underline">
                Ver tu plan
              </Link>
            </span>
          </Alert>
        </div>
      )}
      {reports.isLoading ? (
        <LoadingRows rows={2} />
      ) : (reports.data ?? []).length === 0 ? (
        enabled && <EmptyState title="Sin reportes programados" />
      ) : (
        <ul className="divide-y divide-line">
          {(reports.data ?? []).map((report) => (
            <li
              key={report.id}
              className="flex flex-wrap items-center gap-4 px-5 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {report.name}
                  <Badge>
                    {report.channel === "email" ? "Correo + CSV" : "WhatsApp"}
                  </Badge>
                  {report.lastError && (
                    <Badge tone="danger">Último envío con error</Badge>
                  )}
                </p>
                <p className="text-xs text-ink-muted">
                  {FREQUENCY_LABELS[report.frequency]} ·{" "}
                  {report.recipients.join(", ")}
                </p>
                <p className="text-xs text-ink-muted">
                  {report.nextRunAt
                    ? `Próximo envío: ${format.dateTime(report.nextRunAt)}`
                    : "Se programará en el próximo ciclo"}
                  {report.lastSentAt &&
                    ` · Último: ${format.dateTime(report.lastSentAt)}`}
                </p>
                {report.lastError && (
                  <p className="text-xs text-danger">{report.lastError}</p>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-1">
                  <Switch
                    label={`Enviar ${report.name}`}
                    checked={report.enabled}
                    disabled={!enabled}
                    onChange={(value) =>
                      save.mutate({ id: report.id, enabled: value })
                    }
                  />
                  <IconButton
                    label={`Editar ${report.name}`}
                    onClick={() => setEditing({ report })}
                  >
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton
                    label={`Eliminar ${report.name}`}
                    className="hover:bg-danger-soft hover:text-danger"
                    onClick={() => setDeleting(report)}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ReportDialog
        open={Boolean(editing)}
        report={editing?.report ?? null}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Eliminar reporte programado"
        message={`Dejará de enviarse "${deleting?.name ?? ""}".`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
      />
    </Card>
  );
}
