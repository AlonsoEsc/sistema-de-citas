const STATE_LABELS: Record<string, { label: string; className: string }> = {
  trialing: { label: "En prueba", className: "bg-indigo-50 text-indigo-700" },
  active: { label: "Activa", className: "bg-emerald-50 text-emerald-700" },
  past_due: {
    label: "Pago pendiente",
    className: "bg-amber-50 text-amber-700",
  },
  expired: { label: "Vencida", className: "bg-red-50 text-red-700" },
  canceled: { label: "Cancelada", className: "bg-slate-100 text-slate-600" },
};

export function SubscriptionBadge({
  state,
  suspended,
}: {
  state: string;
  suspended?: boolean;
}) {
  const badge = suspended
    ? { label: "Suspendido", className: "bg-red-100 text-red-800" }
    : (STATE_LABELS[state] ?? {
        label: state,
        className: "bg-slate-100 text-slate-600",
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
