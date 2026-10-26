/** Estados que cuentan como ingreso (cita realizada o comprometida). */
const REVENUE_STATUSES = new Set(["completed", "confirmed"]);

export type ReportAppointment = {
  status: string;
  priceCents: number;
  staffId: string;
  staffName: string;
};

export type StaffSummary = {
  staffId: string;
  name: string;
  revenueCents: number;
  appointments: number;
};

/** Metricas de un periodo. Fuente unica para el panel y los reportes programados. */
export function summarizeAppointments(rows: ReportAppointment[]) {
  const byStaff = new Map<string, StaffSummary>();
  let revenueCents = 0;
  for (const row of rows) {
    const staff = byStaff.get(row.staffId) ?? {
      staffId: row.staffId,
      name: row.staffName,
      revenueCents: 0,
      appointments: 0,
    };
    staff.appointments += 1;
    if (REVENUE_STATUSES.has(row.status)) {
      staff.revenueCents += row.priceCents;
      revenueCents += row.priceCents;
    }
    byStaff.set(row.staffId, staff);
  }
  const total = rows.length;
  const count = (status: string) =>
    rows.filter((row) => row.status === status).length;
  return {
    metrics: {
      totalAppointments: total,
      totalRevenueCents: revenueCents,
      noShows: count("no_show"),
      cancellationRate: total === 0 ? 0 : count("cancelled") / total,
    },
    byStaff: [...byStaff.values()].sort(
      (a, b) => b.revenueCents - a.revenueCents,
    ),
  };
}

export type BreakdownAppointment = {
  /** Fecha de calendario (YYYY-MM-DD) en la zona horaria del negocio. */
  day: string;
  status: string;
  priceCents: number;
  services: Array<{ serviceId: string; name: string; priceCents: number }>;
};

export type DaySummary = {
  date: string;
  appointments: number;
  revenueCents: number;
};

export type ServiceSummary = {
  serviceId: string;
  name: string;
  appointments: number;
  revenueCents: number;
};

/** Citas e ingresos por dia y por servicio, para las graficas del panel. */
export function breakdownAppointments(rows: BreakdownAppointment[]) {
  const byDay = new Map<string, DaySummary>();
  const byService = new Map<string, ServiceSummary>();
  for (const row of rows) {
    const counts = REVENUE_STATUSES.has(row.status);
    const day = byDay.get(row.day) ?? {
      date: row.day,
      appointments: 0,
      revenueCents: 0,
    };
    day.appointments += 1;
    day.revenueCents += counts ? row.priceCents : 0;
    byDay.set(row.day, day);

    for (const service of row.services) {
      const summary = byService.get(service.serviceId) ?? {
        serviceId: service.serviceId,
        name: service.name,
        appointments: 0,
        revenueCents: 0,
      };
      summary.appointments += 1;
      summary.revenueCents += counts ? service.priceCents : 0;
      byService.set(service.serviceId, summary);
    }
  }
  return {
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byService: [...byService.values()].sort(
      (a, b) =>
        b.appointments - a.appointments || b.revenueCents - a.revenueCents,
    ),
  };
}
