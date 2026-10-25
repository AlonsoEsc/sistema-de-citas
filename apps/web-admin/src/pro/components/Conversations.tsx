import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarBlank,
  CaretDown,
  Check,
  Clock,
  MagnifyingGlass,
  NotePencil,
  PaperPlaneTilt,
  Pause,
  Scissors,
  Sparkle,
  Star,
  Tag,
  User,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { api } from "../../lib/api";
import type { Appointment, Client } from "../types";

type MessagingMessage = {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  eventType: string | null;
  deliveryStatus: "queued" | "sent" | "delivered" | "read" | "failed";
  createdAt: string;
};

type MessagingAppointment = {
  id: string;
  status: Appointment["status"];
  startAt: string;
  endAt: string;
  priceCents: number;
  currency: string;
  staffName: string;
  services: string[];
};

type MessagingConversation = {
  id: string;
  customerId: string | null;
  customerName: string;
  phoneMasked: string;
  state: string;
  humanHandoff: boolean;
  lastMessageAt: string | null;
  messages: MessagingMessage[];
  appointment: MessagingAppointment | null;
};

type MessagingResponse = {
  paused: boolean;
  pauseReason: string;
  providerStatus: string;
  conversations: MessagingConversation[];
};

type ConversationsProps = {
  clients: Client[];
  appointments: Appointment[];
  onConfirmWithoutNotifications: (id: string) => Promise<void>;
  onNavigate: (tab: string) => void;
};

function avatarFor(index: number) {
  return `/assets/contacts/avatar-${(index % 8) + 1}.jpg`;
}

function formatTime(value: string | null) {
  if (!value) return "Sin actividad";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("es-SV", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("es-SV", { day: "2-digit", month: "short" });
}

function formatLongDate(value: string) {
  return new Date(value).toLocaleDateString("es-SV", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fallbackConversations(
  clients: Client[],
  appointments: Appointment[],
): MessagingConversation[] {
  return clients.slice(0, 12).map((client) => {
    const appointment = appointments
      .filter((row) => row.clientId === client.id)
      .sort((left, right) =>
        `${right.date}T${right.time}`.localeCompare(
          `${left.date}T${left.time}`,
        ),
      )[0];

    return {
      id: `customer:${client.id}`,
      customerId: client.id,
      customerName: client.name,
      phoneMasked: client.phone
        ? `•••• ${client.phone.replace(/\D/g, "").slice(-4)}`
        : "Sin teléfono",
      state: "idle",
      humanHandoff: false,
      lastMessageAt: appointment
        ? new Date(`${appointment.date}T${appointment.time}:00`).toISOString()
        : null,
      messages: [],
      appointment: appointment
        ? {
            id: appointment.id,
            status: appointment.status,
            startAt: new Date(
              `${appointment.date}T${appointment.time}:00`,
            ).toISOString(),
            endAt: new Date(
              new Date(`${appointment.date}T${appointment.time}:00`).getTime() +
                appointment.duration * 60_000,
            ).toISOString(),
            priceCents: Math.round(appointment.price * 100),
            currency: "USD",
            staffName: appointment.professionalName,
            services: [appointment.serviceName],
          }
        : null,
    };
  });
}

export default function Conversations({
  clients,
  appointments,
  onConfirmWithoutNotifications,
  onNavigate,
}: ConversationsProps) {
  const messagingQuery = useQuery({
    queryKey: ["messaging-conversations"],
    queryFn: async () =>
      (await api.get<MessagingResponse>("/messaging/conversations")).data,
    retry: 1,
  });
  const conversations = useMemo(
    () =>
      messagingQuery.data?.conversations.length
        ? messagingQuery.data.conversations
        : fallbackConversations(clients, appointments),
    [appointments, clients, messagingQuery.data],
  );
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "handoff">("all");
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!selectedId && conversations[0]) {
      setSelectedId(conversations[0].id);
    }
  }, [conversations, selectedId]);

  const filtered = conversations.filter((conversation) => {
    const matchesText =
      `${conversation.customerName} ${conversation.phoneMasked}`
        .toLowerCase()
        .includes(query.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "handoff" && conversation.humanHandoff) ||
      (filter === "unread" &&
        conversation.messages[conversation.messages.length - 1]?.direction ===
          "inbound");
    return matchesText && matchesFilter;
  });
  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ??
    filtered[0] ??
    conversations[0];
  const selectedIndex = Math.max(
    0,
    conversations.findIndex((conversation) => conversation.id === selected?.id),
  );
  const proposal = selected?.appointment;
  const confirmed = proposal
    ? confirmedIds.has(proposal.id) || proposal.status === "confirmed"
    : false;

  async function confirmAppointment() {
    if (!proposal) {
      onNavigate("agenda");
      return;
    }
    await onConfirmWithoutNotifications(proposal.id);
    setConfirmedIds((current) => new Set(current).add(proposal.id));
    setNotice("Cita confirmada sin enviar notificaciones");
    window.setTimeout(() => setNotice(""), 3200);
  }

  return (
    <div className="conversation-workspace">
      <aside className="conversation-inbox">
        <div className="conversation-title">
          <div>
            <WhatsappLogo size={27} weight="fill" />
            <h1>Conversaciones</h1>
          </div>
          <span>
            {messagingQuery.isLoading ? "Cargando" : `${conversations.length}`}
          </span>
        </div>
        <label className="conversation-search">
          <MagnifyingGlass size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar conversaciones"
          />
        </label>
        <div className="conversation-filters">
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            Todas
          </button>
          <button
            className={filter === "unread" ? "active" : ""}
            onClick={() => setFilter("unread")}
          >
            Entrantes
          </button>
          <button
            className={filter === "handoff" ? "active" : ""}
            onClick={() => setFilter("handoff")}
          >
            Atención humana
          </button>
        </div>
        <div className="conversation-list">
          {filtered.map((conversation, index) => {
            const lastMessage =
              conversation.messages[conversation.messages.length - 1];
            return (
              <button
                key={conversation.id}
                className={selected?.id === conversation.id ? "selected" : ""}
                onClick={() => setSelectedId(conversation.id)}
              >
                <span className="conversation-avatar">
                  <img src={avatarFor(index)} alt="" />
                  <i>
                    <WhatsappLogo size={11} weight="fill" />
                  </i>
                </span>
                <span className="conversation-copy">
                  <strong>{conversation.customerName}</strong>
                  <small>
                    {lastMessage?.content || "Sin mensajes almacenados"}
                  </small>
                </span>
                <span className="conversation-meta">
                  <time>{formatTime(conversation.lastMessageAt)}</time>
                  {lastMessage?.direction === "inbound" && <b>1</b>}
                </span>
              </button>
            );
          })}
          {!filtered.length && (
            <div className="conversation-empty">
              No hay conversaciones para este filtro.
            </div>
          )}
        </div>
        <div className="conversation-connection">
          <i /> Servicios de WhatsApp detenidos
        </div>
      </aside>

      <section className="conversation-chat">
        {selected ? (
          <>
            <header>
              <img src={avatarFor(selectedIndex)} alt="" />
              <div>
                <h2>
                  {selected.customerName}{" "}
                  <WhatsappLogo size={15} weight="fill" />
                </h2>
                <small>
                  {selected.phoneMasked} ·{" "}
                  {selected.humanHandoff ? "Atención humana" : "Contacto"}
                </small>
              </div>
              <div>
                <button aria-label="Etiquetas">
                  <Tag size={21} />
                </button>
                <button aria-label="Favorito">
                  <Star size={21} />
                </button>
              </div>
            </header>
            <div className="conversation-messages">
              <span className="conversation-date">Historial guardado</span>
              {selected.messages.length ? (
                selected.messages.map((message) => (
                  <article
                    className={
                      message.direction === "outbound" ? "outbound" : "inbound"
                    }
                    key={message.id}
                  >
                    <p>
                      {message.content ||
                        message.eventType ||
                        "Evento de WhatsApp"}
                    </p>
                    <time>
                      {formatTime(message.createdAt)}
                      {message.direction === "outbound" && (
                        <Check size={13} weight="bold" />
                      )}
                    </time>
                  </article>
                ))
              ) : (
                <div className="conversation-no-messages">
                  <WhatsappLogo size={35} />
                  <strong>
                    No hay mensajes almacenados para este contacto
                  </strong>
                  <p>
                    La bandeja se llenará con el historial real cuando WhatsApp
                    vuelva a habilitarse.
                  </p>
                </div>
              )}
            </div>
            <div className="conversation-composer">
              <button type="button" disabled aria-label="Añadir nota">
                <NotePencil size={20} />
              </button>
              <input
                disabled
                placeholder="WhatsApp está pausado"
                aria-label="Mensaje pausado"
              />
              <button type="button" disabled aria-label="Enviar deshabilitado">
                <PaperPlaneTilt size={19} weight="fill" />
              </button>
            </div>
            <div className="conversation-pause">
              <div>
                <Pause size={17} weight="fill" />
                <span>
                  <strong>WhatsApp pausado</strong>
                  <small>
                    No se enviarán mensajes automáticos ni manuales.
                  </small>
                </span>
              </div>
              <button type="button" onClick={() => onNavigate("ajustes")}>
                Ver configuración
              </button>
            </div>
          </>
        ) : (
          <div className="conversation-empty-main">
            Selecciona una conversación.
          </div>
        )}
      </section>

      <aside className="conversation-assistant">
        <header>
          <Sparkle size={25} weight="fill" />
          <h2>Asistente de citas</h2>
          <span>Seguro</span>
        </header>
        <div className="assistant-content">
          <div className="assistant-heading">
            <strong>Resumen del cliente</strong>
            <span>Sin envíos</span>
          </div>
          <div className="assistant-intent">
            <Sparkle size={24} weight="fill" />
            <p>
              {proposal ? (
                <>
                  Tiene una cita de{" "}
                  <strong>{proposal.services.join(", ") || "servicio"}</strong>{" "}
                  en la agenda.
                </>
              ) : (
                <>Aún no hay una cita asociada a esta conversación.</>
              )}
            </p>
          </div>
          <h3>Propuesta de horario</h3>
          {proposal ? (
            <div className="assistant-proposal">
              <div className="assistant-date">
                <CalendarBlank size={24} />
                <span>
                  {formatLongDate(proposal.startAt)}
                  <strong>
                    {new Date(proposal.startAt).toLocaleTimeString("es-SV", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </strong>
                </span>
                <b>{confirmed ? "Confirmada" : proposal.status}</b>
              </div>
              <dl>
                <div>
                  <dt>
                    <Clock size={18} /> Duración
                  </dt>
                  <dd>
                    {Math.max(
                      1,
                      Math.round(
                        (new Date(proposal.endAt).getTime() -
                          new Date(proposal.startAt).getTime()) /
                          60_000,
                      ),
                    )}{" "}
                    min
                  </dd>
                </div>
                <div>
                  <dt>
                    <Scissors size={18} /> Servicio
                  </dt>
                  <dd>{proposal.services.join(", ") || "Servicio"}</dd>
                </div>
                <div>
                  <dt>
                    <User size={18} /> Profesional
                  </dt>
                  <dd>{proposal.staffName}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>
                    {new Intl.NumberFormat("es-SV", {
                      style: "currency",
                      currency: proposal.currency === "MXN" ? "MXN" : "USD",
                    }).format(proposal.priceCents / 100)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="assistant-no-proposal">
              No hay una cita próxima para mostrar.
            </div>
          )}
          <button
            className={
              confirmed ? "assistant-primary confirmed" : "assistant-primary"
            }
            onClick={confirmAppointment}
          >
            {proposal ? <CalendarBlank size={19} /> : <CaretDown size={19} />}
            {proposal
              ? confirmed
                ? "Cita confirmada"
                : "Confirmar sin notificar"
              : "Abrir agenda"}
          </button>
          <button
            className="assistant-secondary"
            onClick={() => onNavigate("agenda")}
          >
            <Clock size={19} /> Ver agenda completa
          </button>
          <button className="assistant-notes">
            Notas del cliente <span>+</span>
          </button>
        </div>
      </aside>
      {notice && (
        <div className="unified-toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
