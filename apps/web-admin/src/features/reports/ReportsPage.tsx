import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PERMISSIONS } from "@citas/shared/access";
import { zonedDateTime } from "@citas/shared/time";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  Skeleton,
} from "../../components/ui/surface";
import { Tabs } from "../../components/ui/tabs";
import { apiErrorMessage } from "../../lib/errors";
import { useAuth } from "../../state/auth";
import { useTenant } from "../../state/tenant";
import { useOverview, type Overview } from "./api";
import { downloadCsv, toCsv } from "./csv";
import {
  PERIOD_LABELS,
  datesBetween,
  periodDates,
  periodRange,
  type PeriodKey,
} from "./periods";
import { ScheduledReports } from "./ScheduledReports";

function Metric({ label, value }: { label: string; value?: string }) {
  return (
    <div className="p-5">
      <p className="text-sm text-ink-muted">{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      )}
    </div>
  );
}

function RankingTable({
  title,
  nameLabel,
  rows,
}: {
  title: string;
  nameLabel: string;
  rows: Array<{
    id: string;
    name: string;
    appointments: number;
    revenueCents: number;
  }>;
}) {
  const { format, terms } = useTenant();
  return (
    <Card>
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-muted">
          Sin datos en este periodo.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-ink-muted uppercase">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">
                {nameLabel}
              </th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">
                {terms.appointments}
              </th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">
                Ingresos
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-5 py-2.5">{row.name}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">
                  {row.appointments}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">
                  {format.money(row.revenueCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function exportCsv(
  overview: Overview,
  label: string,
  terms: ReturnType<typeof useTenant>["terms"],
) {
  const money = (cents: number) => (cents / 100).toFixed(2);
  const content = toCsv([
    {
      title: `Resumen (${label})`,
      header: ["Métrica", "Valor"],
      rows: [
        [terms.appointments, overview.metrics.totalAppointments],
        ["Ingresos", money(overview.metrics.totalRevenueCents)],
        ["No asistieron", overview.metrics.noShows],
        [
          "Tasa de cancelación",
          (overview.metrics.cancellationRate * 100).toFixed(1) + "%",
        ],
      ],
    },
    {
      title: `Por ${terms.staffMember.toLowerCase()}`,
      header: ["Nombre", terms.appointments, "Ingresos"],
      rows: overview.byStaff.map((row) => [
        row.name,
        row.appointments,
        money(row.revenueCents),
      ]),
    },
    {
      title: `Por ${terms.service.toLowerCase()}`,
      header: ["Nombre", terms.appointments, "Ingresos"],
      rows: overview.byService.map((row) => [
        row.name,
        row.appointments,
        money(row.revenueCents),
      ]),
    },
    {
      title: "Por día",
      header: ["Fecha", terms.appointments, "Ingresos"],
      rows: overview.byDay.map((row) => [
        row.date,
        row.appointments,
        money(row.revenueCents),
      ]),
    },
  ]);
  downloadCsv(`reporte-${overview.from.slice(0, 10)}.csv`, content);
}

export function ReportsPage() {
  const { tenant, terms, format, readOnly } = useTenant();
  const { can } = useAuth();
  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const today = format.calendarDate(new Date());
  const range = periodRange(period, today, tenant.timezone);
  const overview = useOverview(range);
  const [metric, setMetric] = useState<"appointments" | "revenue">(
    "appointments",
  );

  const chartData = useMemo(() => {
    const { fromDate, toDate } = periodDates(period, today);
    const byDate = new Map(
      (overview.data?.byDay ?? []).map((row) => [row.date, row]),
    );
    return datesBetween(fromDate, toDate).map((date) => ({
      date,
      label: format.shortDay(zonedDateTime(date, "12:00", tenant.timezone)),
      appointments: byDate.get(date)?.appointments ?? 0,
      revenue: (byDate.get(date)?.revenueCents ?? 0) / 100,
    }));
  }, [overview.data, period, today, format, tenant.timezone]);

  const metrics = overview.data?.metrics;

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Calculados con la zona horaria de tu negocio."
        actions={
          <>
            <select
              aria-label="Periodo"
              value={period}
              onChange={(event) => setPeriod(event.target.value as PeriodKey)}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
            >
              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              icon={<Download className="size-4" />}
              disabled={!overview.data}
              onClick={() =>
                overview.data &&
                exportCsv(overview.data, PERIOD_LABELS[period], terms)
              }
            >
              Exportar CSV
            </Button>
          </>
        }
      />

      {overview.isError ? (
        <Card>
          <ErrorState
            message={apiErrorMessage(
              overview.error,
              "No se pudo calcular el reporte.",
            )}
            onRetry={() => void overview.refetch()}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            <Metric
              label={terms.appointments}
              value={metrics && String(metrics.totalAppointments)}
            />
            <Metric
              label="Ingresos"
              value={metrics && format.money(metrics.totalRevenueCents)}
            />
            <Metric
              label="No asistieron"
              value={metrics && String(metrics.noShows)}
            />
            <Metric
              label="Cancelaciones"
              value={metrics && format.percent(metrics.cancellationRate)}
            />
          </Card>

          <Card>
            <CardHeader
              title="Por día"
              description="Ingresos de citas confirmadas y completadas."
            />
            <div className="px-5 pt-4">
              <Tabs
                label="Dato de la gráfica"
                value={metric}
                onChange={setMetric}
                tabs={[
                  { value: "appointments", label: terms.appointments },
                  { value: "revenue", label: "Ingresos" },
                ]}
              />
            </div>
            {overview.isLoading ? (
              <LoadingRows rows={4} />
            ) : overview.data?.metrics.totalAppointments === 0 ? (
              <EmptyState
                title={`No hubo ${terms.appointments.toLowerCase()} en este periodo`}
              />
            ) : (
              <div
                className="h-72 px-2 pb-4"
                role="img"
                aria-label={`Gráfica de ${metric === "revenue" ? "ingresos" : terms.appointments.toLowerCase()} por día`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} className="stroke-line" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      tick={{ className: "fill-ink-muted text-[11px]" }}
                    />
                    <YAxis
                      allowDecimals={metric === "revenue"}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tick={{ className: "fill-ink-muted text-[11px]" }}
                    />
                    <Tooltip
                      cursor={{ className: "fill-surface-muted" }}
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        borderRadius: 12,
                        color: "var(--ink)",
                      }}
                      formatter={(value) => [
                        metric === "revenue"
                          ? format.money(Math.round(Number(value ?? 0) * 100))
                          : Number(value ?? 0),
                        metric === "revenue" ? "Ingresos" : terms.appointments,
                      ]}
                    />
                    <Bar
                      dataKey={metric}
                      className="fill-primary"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <RankingTable
              title={`Por ${terms.staffMember.toLowerCase()}`}
              nameLabel={terms.staffMember}
              rows={(overview.data?.byStaff ?? []).map((row) => ({
                ...row,
                id: row.staffId,
              }))}
            />
            <RankingTable
              title={`Por ${terms.service.toLowerCase()}`}
              nameLabel={terms.service}
              rows={(overview.data?.byService ?? []).map((row) => ({
                ...row,
                id: row.serviceId,
              }))}
            />
          </div>

          <ScheduledReports
            canManage={can(PERMISSIONS.settingsManage) && !readOnly}
          />
        </div>
      )}
    </>
  );
}
