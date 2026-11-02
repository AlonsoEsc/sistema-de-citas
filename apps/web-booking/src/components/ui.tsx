import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Info,
  Loader2,
} from "lucide-react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-primary text-on-primary hover:bg-primary-hover",
        variant === "secondary" &&
          "border border-line bg-surface text-ink hover:bg-surface-muted",
        variant === "ghost" &&
          "text-ink-muted hover:bg-surface-muted hover:text-ink",
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cx(
          "h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20",
          className,
        )}
        {...props}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

const noticeStyles = {
  success: {
    box: "border-success/30 bg-success-soft",
    icon: CheckCircle2,
    color: "text-success",
  },
  error: {
    box: "border-danger/30 bg-danger-soft",
    icon: AlertCircle,
    color: "text-danger",
  },
  info: {
    box: "border-primary/25 bg-primary-soft",
    icon: Info,
    color: "text-primary",
  },
  warning: {
    box: "border-warning/30 bg-warning-soft",
    icon: AlertCircle,
    color: "text-warning",
  },
};

export function Notice({
  tone,
  children,
}: {
  tone: keyof typeof noticeStyles;
  children: ReactNode;
}) {
  const style = noticeStyles[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm",
        style.box,
      )}
    >
      <style.icon className={cx("mt-0.5 size-4 shrink-0", style.color)} />
      <div>{children}</div>
    </div>
  );
}

export function BackButton({
  onClick,
  children = "Volver",
}: {
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-ink-muted hover:text-ink"
    >
      <ArrowLeft className="size-4" /> {children}
    </button>
  );
}

export function SectionTitle({
  step,
  children,
}: {
  step?: number;
  children: ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold">
      {step !== undefined && (
        <span className="grid size-6 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
          {step}
        </span>
      )}
      {children}
    </h2>
  );
}

/** Pantalla completa con un mensaje (negocio inexistente, portal cerrado, cargando). */
export function PortalMessage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-ink-muted">{children}</p>
      </div>
    </main>
  );
}
