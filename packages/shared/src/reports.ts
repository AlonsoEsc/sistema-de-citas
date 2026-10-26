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
