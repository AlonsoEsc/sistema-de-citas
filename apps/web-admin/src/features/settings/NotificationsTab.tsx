import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { ENTITLEMENTS } from "@citas/shared/billing";
import { Button, IconButton } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Field, Switch, TextAreaField } from "../../components/ui/form";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LoadingRows,
} from "../../components/ui/surface";
import { useTenant } from "../../state/tenant";
import {
  useSaveTemplate,
  useTemplates,
  useToggleTemplate,
  type NotificationTemplate,
} from "./api";

const EVENT_LABELS: Record<string, string> = {
  "appointment.created": "Cita agendada",
  "appointment.confirmed": "Cita confirmada",
  "appointment.cancelled": "Cita cancelada por el negocio",
  "appointment.cancelled_by_customer": "Cita cancelada por el cliente",
  "appointment.reminder_24h": "Recordatorio 24 horas antes",
  "appointment.reminder_2h": "Recordatorio 2 horas antes",
  "appointment.followup": "Seguimiento después de la cita",
  "appointment.no_show_followup": "Seguimiento si no asistió",
  "auth.otp.requested": "Código de acceso al portal",
};

const CHANNEL_LABELS: Record<NotificationTemplate["channel"], string> = {
  email: "Correo",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

const CHANNEL_FEATURE = {
  email: ENTITLEMENTS.emailNotifications,
  sms: ENTITLEMENTS.smsNotifications,
  whatsapp: ENTITLEMENTS.whatsappNotifications,
} as const;

/** El codigo de acceso es obligatorio: sin el nadie podria entrar al portal. */
const REQUIRED_EVENTS = new Set(["auth.otp.requested"]);

const VARIABLES = [
  ["{{customerName}}", "nombre del cliente"],
  ["{{staffName}}", "quién atiende"],
  ["{{when}}", "fecha y hora"],
  ["{{time}}", "solo la hora"],
];

function TemplateDialog({
  template,
  onClose,
}: {
  template: NotificationTemplate | null;
  onClose: () => void;
}) {
  const save = useSaveTemplate();
  const [form, setForm] = useState({ subject: "", body: "" });
  const [loadedFor, setLoadedFor] = useState<NotificationTemplate | null>(null);
  if (template && loadedFor !== template) {
    setLoadedFor(template);
    setForm({ subject: template.subject ?? "", body: template.body });
  }
  const close = () => {
    setLoadedFor(null);
    onClose();
  };
  const usesMetaTemplate =
    template?.channel === "whatsapp" &&
    Boolean(
      (template.variablesJson as { evolution?: unknown } | null)?.evolution,
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!template) {
      return;
    }
    save.mutate(
      {
        id: template.id,
        subject: template.channel === "email" ? form.subject : undefined,
        body: form.body,
      },
      { onSuccess: close },
    );
  };

  return (
    <Dialog
      open={Boolean(template)}
      onClose={close}
      title={
        template ? (EVENT_LABELS[template.eventType] ?? template.eventType) : ""
      }
      description={
        template &&
        `Mensaje por ${CHANNEL_LABELS[template.channel].toLowerCase()}`
      }
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" form="template-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="template-form" onSubmit={submit} className="space-y-4">
        {template?.channel === "email" && (
          <Field
            label="Asunto"
            value={form.subject}
            onChange={(event) =>
              setForm({ ...form, subject: event.target.value })
            }
          />
        )}
        <TextAreaField
          label="Mensaje"
          rows={5}
          required
          minLength={3}
          value={form.body}
          onChange={(event) => setForm({ ...form, body: event.target.value })}
        />
        <div className="rounded-xl bg-surface-muted p-3 text-xs text-ink-muted">
          <p className="mb-1 font-semibold text-ink">
            Datos que puedes incluir
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {VARIABLES.map(([token, label]) => (
              <li key={token}>
                <code className="text-primary">{token}</code> {label}
              </li>
            ))}
          </ul>
        </div>
        {usesMetaTemplate && (
          <p className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs text-ink">
            Este aviso está vinculado a una plantilla aprobada por Meta:
            WhatsApp envía el texto aprobado allí, no el que escribas aquí. Para
            cambiarlo, edita la plantilla en Meta.
          </p>
        )}
      </form>
    </Dialog>
  );
}

export function NotificationsTab() {
  const { hasFeature, readOnly } = useTenant();
  const templates = useTemplates();
  const toggle = useToggleTemplate();
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);

  const byChannel = (["whatsapp", "email", "sms"] as const).map((channel) => ({
    channel,
    available: hasFeature(CHANNEL_FEATURE[channel]) || channel === "email",
    items: (templates.data ?? []).filter((item) => item.channel === channel),
  }));

  if (templates.isLoading) {
    return (
      <Card>
        <LoadingRows rows={5} />
      </Card>
    );
  }
  if ((templates.data ?? []).length === 0) {
    return (
      <Card>
        <EmptyState title="No hay avisos configurados" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {byChannel
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <Card key={group.channel}>
            <CardHeader
              title={CHANNEL_LABELS[group.channel]}
              description={
                group.available
                  ? "Activa solo los avisos que quieras que reciban tus clientes."
                  : "Tu plan no incluye este canal: estos avisos no se envían."
              }
              actions={
                !group.available && (
                  <Badge tone="warning">No incluido en tu plan</Badge>
                )
              }
            />
            <ul className="divide-y divide-line">
              {group.items.map((template) => {
                const required = REQUIRED_EVENTS.has(template.eventType);
                return (
                  <li
                    key={template.id}
                    className="flex items-center gap-4 px-5 py-3.5"
                  >
                    <Switch
                      label={`${EVENT_LABELS[template.eventType] ?? template.eventType} por ${CHANNEL_LABELS[template.channel]}`}
                      checked={template.enabled}
                      disabled={required || readOnly || toggle.isPending}
                      onChange={(enabled) =>
                        toggle.mutate({ id: template.id, enabled })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {EVENT_LABELS[template.eventType] ?? template.eventType}
                        {required && <Badge>Obligatorio</Badge>}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {template.body}
                      </p>
                    </div>
                    {!readOnly && (
                      <IconButton
                        label={`Editar mensaje: ${EVENT_LABELS[template.eventType] ?? template.eventType} por ${CHANNEL_LABELS[template.channel]}`}
                        onClick={() => setEditing(template)}
                      >
                        <Pencil className="size-4" />
                      </IconButton>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      <TemplateDialog template={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
