import { Check, Minus } from "lucide-react";
import { ENTITLEMENTS } from "@citas/shared/billing";
import { Alert } from "../../components/ui/form";
import {
  Badge,
  Card,
  CardHeader,
  LoadingRows,
} from "../../components/ui/surface";
import { cx } from "../../lib/cx";
import { formatMoney } from "../../lib/format";
import { useTenant } from "../../state/tenant";
import { usePlanData, type Plan } from "./api";

const STATE_LABELS: Record<
  string,
  { label: string; tone: "success" | "primary" | "warning" | "danger" }
> = {
  trialing: { label: "Prueba gratis", tone: "primary" },
  active: { label: "Activa", tone: "success" },
  past_due: { label: "Pago pendiente", tone: "warning" },
  expired: { label: "Vencida", tone: "danger" },
  canceled: { label: "Cancelada", tone: "danger" },
};

const FEATURES: Array<[string, string]> = [
  [ENTITLEMENTS.emailNotifications, "Avisos por correo"],
  [ENTITLEMENTS.whatsappNotifications, "Avisos y recordatorios por WhatsApp"],
  [ENTITLEMENTS.advancedReports, "Reportes programados"],
  [ENTITLEMENTS.whatsappAssistant, "Asistente de reservas por WhatsApp"],
];

const METHOD_LABELS: Record<string, string> = {
  transfer: "Transferencia",
  cash: "Efectivo",
  card: "Tarjeta",
  other: "Otro",
};

function UsageBar({
  label,
  used,
  included,
}: {
  label: string;
  used: number;
  included: number;
}) {
  const ratio = included > 0 ? Math.min(1, used / included) : 1;
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-ink-muted">
          {used} de {included}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={included}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={cx(
            "h-full rounded-full",
            ratio >= 1
              ? "bg-danger"
              : ratio >= 0.8
                ? "bg-warning"
                : "bg-primary",
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  current,
  locale,
}: {
  plan: Plan;
  current: boolean;
  locale: string;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border p-5",
        current ? "border-primary bg-primary-soft/40" : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{plan.name}</p>
        {current && <Badge tone="primary">Tu plan</Badge>}
      </div>
      <p className="mt-2 text-2xl font-bold">
        {formatMoney(plan.priceCents, plan.currency, locale)}
        <span className="text-sm font-normal text-ink-muted"> /mes</span>
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex gap-2">
          <Check className="size-4 shrink-0 text-success" />
          Hasta {plan.maxStaff}{" "}
          {plan.maxStaff === 1 ? "profesional" : "profesionales"}
        </li>
        <li className="flex gap-2">
          <Check className="size-4 shrink-0 text-success" />
          {plan.whatsappMessagesPerMonth} mensajes de WhatsApp al mes
        </li>
        {FEATURES.map(([key, label]) => {
          const included = plan.featuresJson?.[key]?.enabled === true;
          return (
            <li
              key={key}
              className={cx("flex gap-2", !included && "text-ink-muted")}
            >
              {included ? (
                <Check className="size-4 shrink-0 text-success" />
              ) : (
                <Minus className="size-4 shrink-0" />
              )}
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PlanTab() {
  const { tenant, format, subscription: tenantSubscription } = useTenant();
  const { subscription, usage, plans } = usePlanData();
  const data = subscription.data;
  const state = STATE_LABELS[data?.state ?? tenantSubscription.state];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Suscripción"
            actions={state && <Badge tone={state.tone}>{state.label}</Badge>}
          />
          {subscription.isLoading ? (
            <LoadingRows rows={2} />
          ) : !data ? (
            <p className="p-5 text-sm text-ink-muted">
              Tu negocio aún no tiene un plan asignado.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 p-5 text-sm">
              <dt className="text-ink-muted">Plan</dt>
              <dd className="font-medium">
                {data.plan.name} ·{" "}
                {formatMoney(
                  data.plan.priceCents,
                  data.plan.currency,
                  tenant.locale,
                )}
                /mes
              </dd>
              <dt className="text-ink-muted">
                {data.state === "trialing"
                  ? "La prueba termina"
                  : "Acceso hasta"}
              </dt>
              <dd className="font-medium">
                {data.accessUntil ? format.date(data.accessUntil) : "—"}
              </dd>
            </dl>
          )}
        </Card>
        <Card>
          <CardHeader title="Consumo del mes" />
          {usage.data ? (
            <div className="space-y-5 p-5">
              <UsageBar
                label="Mensajes de WhatsApp"
                used={usage.data.whatsappMessages.used}
                included={usage.data.whatsappMessages.included}
              />
              <UsageBar
                label="Personal activo"
                used={usage.data.staff.active}
                included={usage.data.staff.max}
              />
              {usage.data.whatsappMessages.used >=
                usage.data.whatsappMessages.included && (
                <p className="text-xs text-ink-muted">
                  Alcanzaste el cupo: los avisos por WhatsApp se pausan hasta el
                  próximo mes; los de correo siguen saliendo.
                </p>
              )}
            </div>
          ) : (
            <LoadingRows rows={2} />
          )}
        </Card>
      </div>

      <Alert tone="info">
        Para cambiar de plan o registrar un pago, contáctanos. Los pagos se
        registran manualmente y tu acceso se extiende en cuanto se confirman.
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        {(plans.data ?? []).map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            current={plan.code === data?.plan.code}
            locale={tenant.locale}
          />
        ))}
      </div>

      {data && data.payments.length > 0 && (
        <Card>
          <CardHeader title="Pagos registrados" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-muted uppercase">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Fecha
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Monto
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Método
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Cubre hasta
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-5 py-2.5">
                      {format.date(payment.paidAt)}
                    </td>
                    <td className="px-5 py-2.5">
                      {formatMoney(
                        payment.amountCents,
                        payment.currency,
                        tenant.locale,
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      {METHOD_LABELS[payment.method] ?? payment.method}
                    </td>
                    <td className="px-5 py-2.5">
                      {format.date(payment.periodEnd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
