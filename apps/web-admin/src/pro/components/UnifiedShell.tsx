import type { ReactNode } from "react";
import {
  AddressBook,
  CalendarBlank,
  CaretDown,
  ChartBar,
  ChatCircleDots,
  GearSix,
  Globe,
  House,
  Moon,
  Pause,
  SignOut,
  Sparkle,
  Sun,
} from "@phosphor-icons/react";
import type { Appointment } from "../types";
import { PRODUCT_NAME } from "../../config/brand";

export type AdminTheme = "light" | "dark";

type UnifiedShellProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  theme: AdminTheme;
  setTheme: (theme: AdminTheme) => void;
  tenantName: string;
  email: string;
  appointments: Appointment[];
  onLogout: () => void;
  hiddenTabs?: string[];
  children: ReactNode;
};

const navItems = [
  { id: "conversaciones", label: "Conversaciones", icon: ChatCircleDots },
  { id: "resumen", label: "Resumen", icon: House },
  { id: "agenda", label: "Agenda", icon: CalendarBlank },
  { id: "catalogos", label: "Catálogos", icon: AddressBook },
  { id: "reportes", label: "Reportes", icon: ChartBar },
  { id: "ajustes", label: "Ajustes", icon: GearSix },
  { id: "portal", label: "Portal de clientes", icon: Globe },
];

function dateKey(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function UnifiedShell({
  activeTab,
  setActiveTab,
  theme,
  setTheme,
  tenantName,
  email,
  appointments,
  onLogout,
  hiddenTabs = [],
  children,
}: UnifiedShellProps) {
  const today = dateKey(new Date());
  const todayAppointments = appointments
    .filter((appointment) => appointment.date === today)
    .sort((left, right) => left.time.localeCompare(right.time))
    .slice(0, 3);
  const dark = theme === "dark";

  return (
    <div className="unified-app" data-admin-theme={theme}>
      <aside className="unified-rail" aria-label="Navegación principal">
        <button
          className="unified-brand-mark"
          type="button"
          aria-label={PRODUCT_NAME}
          onClick={() => setActiveTab("conversaciones")}
        >
          <CalendarBlank size={24} weight="bold" />
        </button>
        <nav>
          {navItems
            .filter((item) => !hiddenTabs.includes(item.id))
            .map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={activeTab === item.id ? "active" : ""}
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => setActiveTab(item.id)}
                >
                  <Icon
                    size={22}
                    weight={activeTab === item.id ? "fill" : "regular"}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
        </nav>
        <button
          className="unified-logout"
          type="button"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          onClick={onLogout}
        >
          <SignOut size={21} />
        </button>
      </aside>

      <section className="unified-workspace">
        <header className="unified-topbar">
          <div className="unified-wordmark">
            <span>
              <Sparkle size={17} weight="fill" />
            </span>
            <div>
              <strong>{PRODUCT_NAME}</strong>
              <small>{tenantName}</small>
            </div>
          </div>

          <div className="unified-paused-banner">
            <span>
              <Pause size={18} weight="fill" />
            </span>
            <div>
              <strong>WhatsApp pausado</strong>
              <small>No se enviarán mensajes ni respuestas automáticas.</small>
            </div>
          </div>

          <button
            className="unified-today"
            type="button"
            onClick={() => setActiveTab("agenda")}
          >
            <CalendarBlank size={18} />
            <div>
              <strong>Agenda de hoy</strong>
              <small>{todayAppointments.length} citas</small>
            </div>
            <div className="unified-today-list">
              {todayAppointments.length ? (
                todayAppointments.map((appointment) => (
                  <span key={appointment.id}>
                    {appointment.time} · {appointment.clientName}
                  </span>
                ))
              ) : (
                <span>Sin citas para hoy</span>
              )}
            </div>
            <CaretDown size={14} />
          </button>

          <div className="unified-theme-control">
            <span>Tema</span>
            <button
              type="button"
              role="switch"
              aria-checked={dark}
              aria-label={`Cambiar a modo ${dark ? "claro" : "oscuro"}`}
              onClick={() => setTheme(dark ? "light" : "dark")}
            >
              <Sun size={15} weight="bold" />
              <i />
              <Moon size={15} weight="bold" />
            </button>
          </div>

          <button className="unified-profile" type="button" title={email}>
            <span>{email.slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>Admin</strong>
              <small>{email}</small>
            </div>
            <CaretDown size={14} />
          </button>
        </header>

        <div
          className={`unified-stage ${activeTab === "conversaciones" ? "conversation-stage" : "module-stage"}`}
        >
          {children}
        </div>
      </section>
    </div>
  );
}
