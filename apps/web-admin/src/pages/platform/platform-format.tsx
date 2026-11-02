const STATE_LABELS: Record<string, { label: string; className: string }> = {
  trialing: { label: "En prueba", className: "bg-primary-soft text-primary" },
  active: { label: "Activa", className: "bg-success-soft text-success" },
  past_due: {
    label: "Pago pendiente",
    className: "bg-warning-soft text-warning",
  },
  expired: { label: "Vencida", className: "bg-danger-soft text-danger" },
  canceled: {
    label: "Cancelada",
    className: "bg-surface-muted text-ink-muted",
  },
};

export function SubscriptionBadge({
  state,
  suspended,
}: {
  state: string;
  suspended?: boolean;
}) {
  const badge = suspended
    ? { label: "Suspendido", className: "bg-danger-soft text-danger" }
    : (STATE_LABELS[state] ?? {
        label: state,
        className: "bg-surface-muted text-ink-muted",
      });
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

export function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("es-SV", { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "—";
}

export function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("es-SV", { style: "currency", currency }).format(
    cents / 100,
  );
}
