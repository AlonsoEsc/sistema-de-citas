import { useState, type FormEvent, type ReactNode } from "react";
import { CalendarDays, MessageCircle, MessagesSquare } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/dialog";
import { Alert, Field } from "../../components/ui/form";
import { Badge, Card, LoadingRows } from "../../components/ui/surface";
import { useToast } from "../../components/ui/toast";
import { useTenant } from "../../state/tenant";
import {
  useConnectChatwoot,
  useConnectEvolution,
  useDisconnect,
  useIntegrations,
  useStartGoogle,
  useWhatsappSetup,
  type Connection,
  type IntegrationStatus,
} from "./api";

const STATUS: Record<
  IntegrationStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  connected: { label: "Conectado", tone: "success" },
  pending: { label: "Pendiente", tone: "warning" },
  error: { label: "Con error", tone: "danger" },
  disconnected: { label: "Sin conectar", tone: "neutral" },
};

function IntegrationCard({
  icon,
  title,
  description,
  status,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  status: IntegrationStatus;
  children: ReactNode;
}) {
  return (
    <Card>
      <header className="flex flex-wrap items-start gap-4 border-b border-line px-5 py-4">
        <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-ink-muted">{description}</p>
        </div>
        <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </Card>
  );
}

function DisconnectButton({
  provider,
  label,
}: {
  provider: Connection["provider"];
  label: string;
}) {
  const disconnect = useDisconnect();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        Desconectar
      </Button>
      <ConfirmDialog
        open={confirming}
        title={`Desconectar ${label}`}
        message="Se borran las credenciales guardadas. Puedes volver a conectar cuando quieras."
        confirmLabel="Desconectar"
        loading={disconnect.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          disconnect.mutate(provider, { onSuccess: () => setConfirming(false) })
        }
      />
    </>
  );
}

function WhatsappCard() {
  const setup = useWhatsappSetup();
  const connect = useConnectEvolution();
  const toast = useToast();
  const [form, setForm] = useState({
    baseUrl: "",
    apiKey: "",
    instanceName: "",
  });
  const status = setup.data?.status ?? "disconnected";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    connect.mutate(form, {
      onSuccess: () => setForm({ ...form, apiKey: "" }),
    });
  };

  return (
    <IntegrationCard
      icon={<MessageCircle className="size-5" />}
      title="WhatsApp (Evolution API)"
      description="Asistente de reservas, confirmaciones y recordatorios por WhatsApp."
      status={status}
    >
      {setup.isLoading ? (
        <LoadingRows rows={2} />
      ) : (
        <>
          {setup.data?.lastError && (
            <Alert tone="error">{setup.data.lastError}</Alert>
          )}
          {setup.data?.instanceName && (
            <p className="text-sm">
              Instancia:{" "}
              <span className="font-medium">{setup.data.instanceName}</span>
            </p>
          )}
          {setup.data?.webhookUrl && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Webhook</p>
              <div className="flex gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-muted px-3 py-2 text-xs">
                  {setup.data.webhookUrl}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(setup.data!.webhookUrl!)
                      .then(() => toast.success("Copiado."))
                      .catch(() => toast.error("No se pudo copiar."))
                  }
                >
                  Copiar
                </Button>
              </div>
              <p className="text-xs text-ink-muted">
                Se configura solo al conectar. Úsalo si necesitas revisarlo en
                Evolution.
              </p>
            </div>
          )}
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <Field
              label="URL de Evolution"
              type="url"
              placeholder="https://evolution.tudominio.com"
              required
              value={form.baseUrl}
              onChange={(event) =>
                setForm({ ...form, baseUrl: event.target.value })
              }
            />
            <Field
              label="Nombre de la instancia"
              required
              value={form.instanceName}
              onChange={(event) =>
                setForm({ ...form, instanceName: event.target.value })
              }
            />
            <Field
              label="API key"
              type="password"
              autoComplete="off"
              required
              minLength={8}
              value={form.apiKey}
              onChange={(event) =>
                setForm({ ...form, apiKey: event.target.value })
              }
            />
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              <Button type="submit" loading={connect.isPending}>
                {status === "disconnected" ? "Conectar" : "Actualizar conexión"}
              </Button>
              {status !== "disconnected" && (
                <DisconnectButton provider="whatsapp" label="WhatsApp" />
              )}
            </div>
          </form>
          <p className="text-xs text-ink-muted">
            La API key se guarda cifrada y nunca se vuelve a mostrar.
          </p>
        </>
      )}
    </IntegrationCard>
  );
}

function ChatwootCard({ connection }: { connection?: Connection }) {
  const connect = useConnectChatwoot();
  const [form, setForm] = useState({
    baseUrl: "",
    apiToken: "",
    accountId: "",
    inboxId: "",
  });
  const status = connection?.status ?? "disconnected";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    connect.mutate(
      {
        baseUrl: form.baseUrl,
        apiToken: form.apiToken,
        accountId: Number(form.accountId),
        inboxId: Number(form.inboxId),
      },
      { onSuccess: () => setForm({ ...form, apiToken: "" }) },
    );
  };

  return (
    <IntegrationCard
      icon={<MessagesSquare className="size-5" />}
      title="Chatwoot"
      description="Copia las conversaciones de WhatsApp en Chatwoot para responder en equipo."
      status={status}
    >
      {connection?.lastError && (
        <Alert tone="error">{connection.lastError}</Alert>
      )}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field
          label="URL de Chatwoot"
          type="url"
          required
          value={form.baseUrl}
          onChange={(event) =>
            setForm({ ...form, baseUrl: event.target.value })
          }
        />
        <Field
          label="Token de acceso"
          type="password"
          autoComplete="off"
          required
          minLength={8}
          value={form.apiToken}
          onChange={(event) =>
            setForm({ ...form, apiToken: event.target.value })
          }
        />
        <Field
          label="ID de la cuenta"
          type="number"
          min={1}
          required
          value={form.accountId}
          onChange={(event) =>
            setForm({ ...form, accountId: event.target.value })
          }
        />
        <Field
          label="ID de la bandeja"
          type="number"
          min={1}
          required
          value={form.inboxId}
          onChange={(event) =>
            setForm({ ...form, inboxId: event.target.value })
          }
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" loading={connect.isPending}>
            {status === "disconnected" ? "Conectar" : "Actualizar conexión"}
          </Button>
          {status !== "disconnected" && (
            <DisconnectButton provider="chatwoot" label="Chatwoot" />
          )}
        </div>
      </form>
    </IntegrationCard>
  );
}

function GoogleCard({
  connection,
  configured,
}: {
  connection?: Connection;
  configured: boolean;
}) {
  const start = useStartGoogle();
  const toast = useToast();
  const status = connection?.status ?? "disconnected";

  // La ventana se abre dentro del clic (si se abre al volver la API, el navegador la bloquea).
  const connectGoogle = () => {
    const popup = window.open("about:blank", "_blank");
    start.mutate(undefined, {
      onSuccess: (result) => {
        if (result.authUrl && popup) {
          popup.opener = null;
          popup.location.href = result.authUrl;
        } else {
          popup?.close();
          toast.error("Google Calendar no está disponible en este momento.");
        }
      },
      onError: () => popup?.close(),
    });
  };

  return (
    <IntegrationCard
      icon={<CalendarDays className="size-5" />}
      title="Google Calendar"
      description="Las citas aparecen en el calendario de Google del negocio."
      status={status}
    >
      {!configured ? (
        <p className="text-sm text-ink-muted">
          Esta integración aún no está habilitada en la plataforma.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {connection?.accountEmail && (
            <p className="mr-auto text-sm">
              Cuenta:{" "}
              <span className="font-medium">{connection.accountEmail}</span>
            </p>
          )}
          <Button onClick={connectGoogle} loading={start.isPending}>
            {status === "connected"
              ? "Volver a autorizar"
              : "Conectar con Google"}
          </Button>
          {status !== "disconnected" && (
            <DisconnectButton
              provider="google_calendar"
              label="Google Calendar"
            />
          )}
        </div>
      )}
      {status === "pending" && (
        <p className="text-xs text-ink-muted">
          Termina la autorización en la ventana de Google y vuelve a esta
          página.
        </p>
      )}
    </IntegrationCard>
  );
}

export function IntegrationsTab() {
  const { readOnly } = useTenant();
  const integrations = useIntegrations();
  const tenantConnection = (provider: Connection["provider"]) =>
    integrations.data?.connections.find(
      (item) => item.provider === provider && item.scope === "tenant",
    );

  return (
    <div className="space-y-6">
      {readOnly && (
        <Alert tone="info">
          Con la cuenta en modo consulta no se pueden cambiar las integraciones.
        </Alert>
      )}
      <fieldset disabled={readOnly} className="space-y-6">
        <WhatsappCard />
        <GoogleCard
          connection={tenantConnection("google_calendar")}
          configured={integrations.data?.configured.googleCalendar ?? false}
        />
        <ChatwootCard connection={tenantConnection("chatwoot")} />
      </fieldset>
    </div>
  );
}
