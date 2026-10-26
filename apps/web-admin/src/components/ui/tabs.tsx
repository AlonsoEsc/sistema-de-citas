import { NavLink } from "react-router";
import { cx } from "../../lib/cx";

const tabClass = (active: boolean) =>
  cx(
    "border-b-2 px-1 pb-3 text-sm font-semibold whitespace-nowrap transition",
    active
      ? "border-primary text-primary"
      : "border-transparent text-ink-muted hover:text-ink",
  );

/** Pestanas que cambian un parametro o estado de la misma pantalla. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="mb-6 flex gap-6 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)]"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          onClick={() => onChange(tab.value)}
          className={tabClass(tab.value === value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Pestanas que son rutas (cada una tiene su propia URL). */
export function RouteTabs({
  tabs,
  label,
}: {
  tabs: Array<{ to: string; label: string }>;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="mb-6 flex gap-6 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)]"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => tabClass(isActive)}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
