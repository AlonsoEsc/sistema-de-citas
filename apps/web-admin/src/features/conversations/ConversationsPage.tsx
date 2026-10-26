import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, MessageCircle, Search } from "lucide-react";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from "../../components/ui/surface";
import { api } from "../../lib/api";
import { cx } from "../../lib/cx";
import { apiErrorMessage } from "../../lib/errors";
import { initials } from "../../lib/format";
import { useTenant } from "../../state/tenant";
import {
  STATUS_LABELS,
  STATUS_TONES,
  type AppointmentStatus,
} from "../agenda/api";

type Conversation = {
  id: string;
  customerId: string | null;
  customerName: string;
  phoneMasked: string;
  state: string;
  humanHandoff: boolean;
  lastMessageAt: string | null;
  messages: Array<{
    id: string;
    direction: "inbound" | "outbound";
    content: string;
    eventType: string | null;
    deliveryStatus: string;
    createdAt: string;
  }>;
  appointment: {
    id: string;
    status: AppointmentStatus;
    startAt: string;
    staffName: string;
    services: string[];
    priceCents: number;
  } | null;
};

type Inbox = {
  providerStatus: "disconnected" | "pending" | "connected" | "error";
  conversations: Conversation[];
};

const PROVIDER_LABELS: Record<
  Inbox["providerStatus"],
  { text: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  connected: { text: "WhatsApp conectado", tone: "success" },
  pending: { text: "WhatsApp pendiente de conexión", tone: "warning" },
  error: { text: "WhatsApp con error", tone: "danger" },
  disconnected: { text: "WhatsApp sin conectar", tone: "neutral" },
};

/** Refresco periodico: los mensajes entran por webhook y no hay canal en tiempo real aun. */
const REFRESH_MS = 20_000;

export function ConversationsPage() {
  const { format, terms } = useTenant();
  const inbox = useQuery({
    queryKey: ["conversations"],
    queryFn: async () =>
      (await api.get<Inbox>("/messaging/conversations")).data,
    refetchInterval: REFRESH_MS,
  });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const conversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (inbox.data?.conversations ?? []).filter(
      (item) =>
        !term ||
        item.customerName.toLowerCase().includes(term) ||
        item.phoneMasked.includes(term),
    );
  }, [inbox.data, search]);
  const selected =
    conversations.find((item) => item.id === selectedId) ??
    conversations[0] ??
    null;
  const provider =
    PROVIDER_LABELS[inbox.data?.providerStatus ?? "disconnected"];

  return (
    <>
      <PageHeader
        title="Conversaciones"
        description="Mensajes de WhatsApp del asistente de reservas y de los avisos automáticos."
        actions={
          inbox.data && (
            <Link to="/ajustes/integraciones">
              <Badge tone={provider.tone}>{provider.text}</Badge>
            </Link>
          )
        }
      />

      {inbox.isError ? (
        <Card>
          <ErrorState
            message={apiErrorMessage(
              inbox.error,
              "No se pudieron cargar las conversaciones.",
            )}
            onRetry={() => void inbox.refetch()}
          />
        </Card>
      ) : inbox.isLoading ? (
        <Card>
          <LoadingRows rows={6} />
        </Card>
      ) : (inbox.data?.conversations ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageCircle className="size-5" />}
            title="Aún no hay conversaciones"
            description={
              inbox.data?.providerStatus === "connected"
                ? "Cuando un cliente escriba a tu WhatsApp aparecerá aquí."
                : "Conecta tu WhatsApp para que tus clientes reserven y reciban avisos por ese medio."
            }
            action={
              inbox.data?.providerStatus !== "connected" && (
                <Link
                  to="/ajustes/integraciones"
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  Conectar WhatsApp
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <Card className="grid min-h-[32rem] overflow-hidden md:grid-cols-[18rem_1fr] xl:grid-cols-[20rem_1fr_17rem]">
          <div className="flex flex-col border-b border-line md:border-r md:border-b-0">
            <label className="relative m-3 block">
              <span className="sr-only">Buscar conversación</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                placeholder="Buscar"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-primary"
              />
            </label>
            <ul className="max-h-[60vh] flex-1 overflow-y-auto">
              {conversations.map((item) => {
                const last = item.messages.at(-1);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={selected?.id === item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={cx(
                        "flex w-full items-start gap-3 px-3 py-3 text-left transition",
                        selected?.id === item.id
                          ? "bg-primary-soft"
                          : "hover:bg-surface-muted",
                      )}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-muted text-xs font-bold text-ink-muted">
                        {initials(item.customerName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold">
                            {item.customerName}
                          </span>
                          {item.lastMessageAt && (
                            <span className="shrink-0 text-[11px] text-ink-muted">
                              {format.calendarDate(item.lastMessageAt) ===
                              format.calendarDate(new Date())
                                ? format.time(item.lastMessageAt)
                                : format.date(item.lastMessageAt)}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          {last?.content || item.phoneMasked}
                        </span>
                        {item.humanHandoff && (
                          <Badge tone="warning" className="mt-1">
                            Pidió hablar con alguien
                          </Badge>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {selected && (
            <>
              <section
                aria-label={`Conversación con ${selected.customerName}`}
                className="flex min-w-0 flex-col"
              >
                <header className="border-b border-line px-5 py-3">
                  <p className="font-semibold">{selected.customerName}</p>
                  <p className="text-xs text-ink-muted">
                    {selected.phoneMasked}
                  </p>
                </header>
                <ol className="max-h-[60vh] flex-1 space-y-3 overflow-y-auto bg-bg/60 px-5 py-4">
                  {selected.messages.length === 0 && (
                    <li className="text-center text-sm text-ink-muted">
                      Sin mensajes recientes.
                    </li>
                  )}
                  {selected.messages.map((message) => (
                    <li
                      key={message.id}
                      className={cx(
                        "flex",
                        message.direction === "outbound"
                          ? "justify-end"
                          : "justify-start",
                      )}
                    >
                      <div
                        className={cx(
                          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap shadow-sm",
                          message.direction === "outbound"
                            ? "rounded-br-sm bg-primary text-on-primary"
                            : "rounded-bl-sm border border-line bg-surface",
                        )}
                      >
                        {message.content || (
                          <em className="opacity-70">Mensaje sin texto</em>
                        )}
                        <span
                          className={cx(
                            "mt-1 block text-right text-[10px]",
                            message.direction === "outbound"
                              ? "text-on-primary/70"
                              : "text-ink-muted",
                          )}
                        >
                          {format.time(message.createdAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="border-t border-line px-5 py-3 text-xs text-ink-muted">
                  Para responder a mano, usa tu WhatsApp o Chatwoot. El
                  asistente atiende reservas, cambios y cancelaciones
                  automáticamente.
                </p>
              </section>

              <aside className="hidden border-l border-line p-5 xl:block">
                <h2 className="text-sm font-semibold">
                  Próxima {terms.appointment.toLowerCase()}
                </h2>
                {selected.appointment ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <Badge tone={STATUS_TONES[selected.appointment.status]}>
                      {STATUS_LABELS[selected.appointment.status]}
                    </Badge>
                    <p className="flex items-center gap-2">
                      <CalendarClock className="size-4 text-ink-muted" />
                      <span className="inline-block first-letter:uppercase">
                        {format.dateTime(selected.appointment.startAt)}
                      </span>
                    </p>
                    <p className="text-ink-muted">
                      {selected.appointment.services.join(", ")}
                    </p>
                    <p className="text-ink-muted">
                      Con {selected.appointment.staffName}
                    </p>
                    <p className="font-semibold">
                      {format.money(selected.appointment.priceCents)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-ink-muted">
                    Sin {terms.appointments.toLowerCase()} en los últimos 30
                    días.
                  </p>
                )}
              </aside>
            </>
          )}
        </Card>
      )}
    </>
  );
}
