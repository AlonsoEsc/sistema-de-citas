import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { ChevronUp, KeyRound, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { AccountBanner } from "../components/AccountBanner";
import { IconButton } from "../components/ui/button";
import { PRODUCT_NAME } from "../config/brand";
import { cx } from "../lib/cx";
import { initials } from "../lib/format";
import { useAuth } from "../state/auth";
import { useTenant } from "../state/tenant";
import { useTheme } from "../state/theme";
import { navigationFor } from "./navigation";

function UserMenu() {
  const { session, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const email = session?.user.email ?? "";

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !ref.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menú de ${email}`}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition hover:bg-surface-muted"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
          {initials(email.split("@")[0].replace(/[._-]/g, " "))}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink">
          {email}
        </span>
        <ChevronUp
          className={cx(
            "size-4 text-ink-muted transition",
            !open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg"
        >
          <NavLink
            role="menuitem"
            to="/cuenta"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface-muted"
          >
            <KeyRound className="size-4 text-ink-muted" /> Mi cuenta
          </NavLink>
          <button
            role="menuitem"
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-soft"
          >
            <LogOut className="size-4" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const { tenant, terms, industry } = useTenant();
  const { theme, toggle } = useTheme();
  const items = navigationFor(terms).filter(
    (item) => !item.permission || can(item.permission),
  );

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center gap-3 px-2 pt-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-on-primary">
          {initials(tenant.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{tenant.name}</p>
          <p className="truncate text-xs text-ink-muted">{industry.label}</p>
        </div>
      </div>

      <nav aria-label="Secciones" className="flex-1 space-y-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                isActive
                  ? "bg-primary-soft text-primary"
                  : "text-ink-muted hover:bg-surface-muted hover:text-ink",
              )
            }
          >
            <item.icon className="size-[18px] shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-1 border-t border-line pt-3">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-muted transition hover:bg-surface-muted hover:text-ink"
        >
          {theme === "dark" ? (
            <Sun className="size-[18px]" />
          ) : (
            <Moon className="size-[18px]" />
          )}
          {theme === "dark" ? "Modo claro" : "Modo oscuro"}
        </button>
        <UserMenu />
        <p className="px-3 pt-1 text-[11px] text-ink-muted">{PRODUCT_NAME}</p>
      </div>
    </div>
  );
}

/** Estructura del panel: barra lateral fija en escritorio y menu desplegable en movil. */
export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { tenant } = useTenant();
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface md:block">
        <Sidebar />
      </aside>

      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
        <IconButton label="Abrir menú" onClick={() => setMenuOpen(true)}>
          <Menu className="size-5" />
        </IconButton>
        <span className="truncate font-semibold">{tenant.name}</span>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-xl">
            <IconButton
              label="Cerrar menú"
              className="absolute top-3 right-3"
              onClick={() => setMenuOpen(false)}
            >
              <X className="size-5" />
            </IconButton>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <main id="contenido" className="px-4 py-6 md:ml-64 md:px-8 md:py-8">
        <div className="mx-auto max-w-7xl">
          <AccountBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
