import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router";
import { Alert, Field, SelectField } from "../../components/ui/form";
import { apiErrorMessage } from "../../lib/errors";
import { platformApi } from "../../lib/platform-api";
import { formatDate, formatMoney, SubscriptionBadge } from "./platform-format";
import type { TenantSummary } from "./PlatformTenantsPage";

type TenantDetail = TenantSummary & {
  subscriptionDetail: {
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    planName: string;
    planPriceCents: number;
  } | null;
  payments: Array<{
    id: string;
    amountCents: number;
    currency: string;
    method: string;
    reference: string | null;
    paidAt: string;
    periodEnd: string;
    recordedBy: string | null;
  }>;
  auditLog: Array<{ action: string; actor: string | null; createdAt: string }>;
};

type Plan = { code: string; name: string; priceCents: number; active: boolean };

const METHOD_LABELS: Record<string, string> = {
  transfer: "Transferencia",
  cash: "Efectivo",
  card: "Tarjeta",
  other: "Otro",
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ActionButton({
  children,
  tone = "primary",
  ...props
}: {
  children: ReactNode;
  tone?: "primary" | "danger";
  type?: "submit" | "button";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const styles =
    tone === "danger"
      ? "bg-danger hover:opacity-90"
      : "bg-primary hover:bg-primary-hover";
  return (
    <button
      type={props.type ?? "submit"}
      {...props}
      className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

export function PlatformTenantPage() {
  const { tenantId = "" } = useParams();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  }>();
  const detail = useQuery({
    queryKey: ["platform-tenant", tenantId],
    queryFn: async () =>
      (await platformApi.get<TenantDetail>(`/platform/tenants/${tenantId}`))
        .data,
  });
  const plans = useQuery({
    queryKey: ["platform-plans"],
    queryFn: async () =>
      (await platformApi.get<Plan[]>("/platform/plans")).data,
  });

  const [payment, setPayment] = useState({
    amount: "",
    method: "transfer",
    months: "1",
    reference: "",
  });

  const run = (successText: string) => ({
    onSuccess: async () => {
      setMessage({ tone: "success", text: successText });
      await queryClient.invalidateQueries({
        queryKey: ["platform-tenant", tenantId],
      });
      await queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
    },
    onError: (error: unknown) =>
      setMessage({
        tone: "error",
        text: apiErrorMessage(error, "No se pudo completar."),
      }),
  });

  const recordPayment = useMutation({
    mutationFn: async () =>
      platformApi.post(`/platform/tenants/${tenantId}/payments`, {
        amountCents: Math.round(Number(payment.amount) * 100),
        method: payment.method,
        months: Number(payment.months),
        reference: payment.reference || undefined,
      }),
    ...run("Pago registrado; la suscripción quedó activa."),
  });
  const changePlan = useMutation({
    mutationFn: async (planCode: string) =>
      platformApi.patch(`/platform/tenants/${tenantId}/subscription`, {
        planCode,
      }),
    ...run("Plan actualizado."),
  });
  const extendTrial = useMutation({
    mutationFn: async (days: number) =>
      platformApi.patch(`/platform/tenants/${tenantId}/subscription`, {
        trialEndsAt: new Date(Date.now() + days * 86_400_000).toISOString(),
      }),
    ...run("Prueba extendida."),
  });
  const setSuspended = useMutation({
    mutationFn: async (suspended: boolean) =>
      platformApi.post(`/platform/tenants/${tenantId}/status`, { suspended }),
    ...run("Estado del negocio actualizado."),
  });

  if (detail.isError) {
    return (
      <Alert tone="error">
        {apiErrorMessage(detail.error, "No se encontró el negocio.")}
      </Alert>
    );
  }
  if (!detail.data) {
    return <p className="text-sm text-ink-muted">Cargando…</p>;
  }
  const tenant = detail.data;
  const suspended = tenant.status === "suspended";

  const submitPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    recordPayment.mutate();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{tenant.name}</h1>
          <p className="text-sm text-ink-muted">
            /{tenant.slug} · {tenant.owner?.email ?? "sin dueño"} · alta{" "}
            {formatDate(tenant.createdAt)}
          </p>
        </div>
        <SubscriptionBadge
          state={tenant.subscription.state}
          suspended={suspended}
        />
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Suscripción">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-ink-muted">Plan</dt>
            <dd className="font-medium">
              {tenant.subscriptionDetail
                ? `${tenant.subscriptionDetail.planName} · ${formatMoney(tenant.subscriptionDetail.planPriceCents, "USD")}/mes`
                : "—"}
            </dd>
            <dt className="text-ink-muted">Acceso hasta</dt>
            <dd className="font-medium">
              {formatDate(tenant.subscription.accessUntil)}
            </dd>
            <dt className="text-ink-muted">Personal activo</dt>
            <dd className="font-medium">{tenant.activeStaff}</dd>
            <dt className="text-ink-muted">Citas</dt>
            <dd className="font-medium">{tenant.appointments}</dd>
          </dl>
          <SelectField
            label="Cambiar plan"
            value={tenant.plan ?? ""}
            onChange={(event) => changePlan.mutate(event.target.value)}
          >
            {(plans.data ?? [])
              .filter((plan) => plan.active)
              .map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.name} · {formatMoney(plan.priceCents, "USD")}
                </option>
              ))}
          </SelectField>
          <div className="flex flex-wrap gap-2">
            {tenant.subscription.state === "trialing" ||
            tenant.subscriptionDetail?.trialEndsAt ? (
              <ActionButton type="button" onClick={() => extendTrial.mutate(7)}>
                Extender prueba 7 días
              </ActionButton>
            ) : null}
            <ActionButton
              type="button"
              tone={suspended ? "primary" : "danger"}
              onClick={() => {
                if (
                  suspended ||
                  window.confirm(
                    "El negocio no podrá usar el panel y su portal dejará de aceptar reservas. ¿Suspender?",
                  )
                ) {
                  setSuspended.mutate(!suspended);
                }
              }}
            >
              {suspended ? "Reactivar negocio" : "Suspender negocio"}
            </ActionButton>
          </div>
        </Card>

        <Card title="Registrar pago">
          <form onSubmit={submitPayment} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Monto (USD)"
                type="number"
                min="0.01"
                step="0.01"
                value={payment.amount}
                onChange={(event) =>
                  setPayment({ ...payment, amount: event.target.value })
                }
                required
              />
              <SelectField
                label="Meses"
                value={payment.months}
                onChange={(event) =>
                  setPayment({ ...payment, months: event.target.value })
                }
              >
                {[1, 3, 6, 12].map((months) => (
                  <option key={months} value={months}>
                    {months}
                  </option>
                ))}
              </SelectField>
            </div>
            <SelectField
              label="Método"
              value={payment.method}
              onChange={(event) =>
                setPayment({ ...payment, method: event.target.value })
              }
            >
              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <Field
              label="Referencia"
              hint="Número de transferencia o comprobante."
              value={payment.reference}
              onChange={(event) =>
                setPayment({ ...payment, reference: event.target.value })
              }
            />
            <ActionButton disabled={recordPayment.isPending}>
              Registrar pago
            </ActionButton>
          </form>
        </Card>
      </div>

      <Card title="Pagos">
        {tenant.payments.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Aún no hay pagos registrados.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-ink-muted">
              <tr>
                <th className="py-2">Fecha</th>
                <th className="py-2">Monto</th>
                <th className="py-2">Método</th>
                <th className="py-2">Referencia</th>
                <th className="py-2">Cubre hasta</th>
                <th className="py-2">Registró</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tenant.payments.map((row) => (
                <tr key={row.id}>
                  <td className="py-2">{formatDate(row.paidAt)}</td>
                  <td className="py-2">
                    {formatMoney(row.amountCents, row.currency)}
                  </td>
                  <td className="py-2">
                    {METHOD_LABELS[row.method] ?? row.method}
                  </td>
                  <td className="py-2">{row.reference ?? "—"}</td>
                  <td className="py-2">{formatDate(row.periodEnd)}</td>
                  <td className="py-2 text-ink-muted">
                    {row.recordedBy ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Bitácora">
        <ul className="space-y-1 text-sm">
          {tenant.auditLog.map((entry, index) => (
            <li
              key={index}
              className="flex justify-between gap-3 text-ink-muted"
            >
              <span>
                <code className="text-xs text-ink-muted">{entry.action}</code>
                {entry.actor && <span className="ml-2">{entry.actor}</span>}
              </span>
              <span className="shrink-0 text-xs text-ink-muted">
                {formatDate(entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
