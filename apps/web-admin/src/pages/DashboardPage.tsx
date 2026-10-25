import { Paper, Stack, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { currency } from "../lib/format";

type OverviewResponse = {
  metrics: {
    totalAppointments: number;
    totalRevenueCents: number;
    noShows: number;
    cancellationRate: number;
  };
  byStaff: Array<{
    staffId: string;
    name: string;
    appointments: number;
    revenueCents: number;
  }>;
};

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 4 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4" sx={{ mt: 1 }}>
        {value}
      </Typography>
    </Paper>
  );
}

export function DashboardPage() {
  const report = useQuery({
    queryKey: ["overview"],
    queryFn: async () => (await api.get<OverviewResponse>("/reports/overview")).data
  });

  const metrics = report.data?.metrics;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Resumen Comercial</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 3 }}>
          <KPI label="Citas del periodo" value={String(metrics?.totalAppointments ?? 0)} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <KPI label="Ingresos" value={currency(metrics?.totalRevenueCents ?? 0)} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <KPI label="No show" value={String(metrics?.noShows ?? 0)} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <KPI
            label="Tasa cancelación"
            value={`${Math.round(((metrics?.cancellationRate ?? 0) * 100 + Number.EPSILON) * 10) / 10}%`}
          />
        </Grid>
      </Grid>

      <Paper sx={{ p: 3, borderRadius: 4 }}>
        <Typography variant="h6">Rendimiento por profesional</Typography>
        <Stack spacing={1.2} sx={{ mt: 2 }}>
          {report.data?.byStaff.map((item) => (
            <Paper key={item.staffId} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography>{item.name}</Typography>
                <Typography color="text.secondary">
                  {item.appointments} citas • {currency(item.revenueCents)}
                </Typography>
              </Stack>
            </Paper>
          ))}
          {!report.data?.byStaff.length && (
            <Typography color="text.secondary">No hay datos todavía para este periodo.</Typography>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
