import type { Prisma, PrismaClient, ScheduledReport } from "@citas/db";
import {
  ENTITLEMENTS,
  evaluateSubscription,
  isEnabled,
  mergeEntitlements,
} from "@citas/shared/billing";
import { normalizePhone } from "@citas/shared/phone";
import { summarizeAppointments } from "@citas/shared/reports";
import {
  isReportFrequency,
  nextReportRun,
  reportPeriod,
  type ReportFrequency,
} from "./report-schedule.js";

const tenantContext = {
  subscription: { include: { plan: true } },
  entitlements: true,
} satisfies Prisma.TenantInclude;

type TenantForReport = Prisma.TenantGetPayload<{
  include: typeof tenantContext;
}>;

const FREQUENCY_LABEL: Record<ReportFrequency, string> = {
  daily: "diario",
  weekly: "semanal",
  monthly: "mensual",
};

function money(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    cents / 100,
  );
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Contenido del reporte: resumen en texto (correo o WhatsApp) y detalle en CSV. */
export function buildReportContent(input: {
  businessName: string;
  frequency: ReportFrequency;
  fromDate: string;
  toDate: string;
  currency: string;
  locale: string;
  summary: ReturnType<typeof summarizeAppointments>;
}) {
  const { metrics, byStaff } = input.summary;
  const format = (cents: number) => money(cents, input.currency, input.locale);
  const lines = [
    `Reporte ${FREQUENCY_LABEL[input.frequency]} de ${input.businessName}`,
    `Periodo: ${input.fromDate} a ${input.toDate} (sin incluir el ultimo dia)`,
    "",
    `Citas: ${metrics.totalAppointments}`,
    `Ingresos: ${format(metrics.totalRevenueCents)}`,
    `No asistieron: ${metrics.noShows}`,
    `Cancelaciones: ${Math.round(metrics.cancellationRate * 100)}%`,
    ...(byStaff.length
      ? [
          "",
          "Por profesional:",
          ...byStaff.map(
            (row) =>
              `- ${row.name}: ${row.appointments} citas, ${format(row.revenueCents)}`,
          ),
        ]
      : []),
  ];
  const csv = [
    ["Profesional", "Citas", "Ingresos"].join(","),
    ...byStaff.map((row) =>
      [
        csvCell(row.name),
        row.appointments,
        (row.revenueCents / 100).toFixed(2),
      ].join(","),
    ),
    [
      "Total",
      metrics.totalAppointments,
      (metrics.totalRevenueCents / 100).toFixed(2),
    ].join(","),
  ].join("\n");
  return { text: lines.join("\n"), csv };
}

function reportUnavailableReason(tenant: TenantForReport, now: Date) {
  if (tenant.status !== "active") {
    return "El negocio esta suspendido";
  }
  if (evaluateSubscription(tenant.subscription, now).access !== "full") {
    return "La suscripcion del negocio esta vencida";
  }
  const entitlements = mergeEntitlements(
    tenant.subscription?.plan.featuresJson,
    tenant.entitlements,
  );
  return isEnabled(entitlements, ENTITLEMENTS.advancedReports)
    ? undefined
    : "El plan del negocio no incluye reportes programados";
}

async function sendReport(
  prisma: PrismaClient,
  report: ScheduledReport,
  tenant: TenantForReport,
  frequency: ReportFrequency,
  now: Date,
) {
  const period = reportPeriod(frequency, now, tenant.timezone);
  const appointments = await prisma.appointment.findMany({
    where: {
      tenantId: tenant.id,
      startAt: { gte: period.from, lt: period.to },
    },
    include: { staff: true },
  });
  const content = buildReportContent({
    businessName: tenant.name,
    frequency,
    fromDate: period.fromDate,
    toDate: period.toDate,
    currency: tenant.currency,
    locale: tenant.locale,
    summary: summarizeAppointments(
      appointments.map((item) => ({
        status: item.status,
        priceCents: item.priceCents,
        staffId: item.staffId,
        staffName: item.staff.displayName,
      })),
    ),
  });

  const recipients = Array.isArray(report.recipientsJson)
    ? report.recipientsJson.map(String)
    : [];
  const subject = `Reporte ${FREQUENCY_LABEL[frequency]} ${period.fromDate}`;
  const rows = recipients.flatMap((recipient) => {
    const to =
      report.channel === "email" ? recipient.trim() : normalizePhone(recipient);
    if (!to) {
      return [];
    }
    return [
      {
        tenantId: tenant.id,
        channel: report.channel,
        eventType: "report.scheduled",
        to,
        // Un reporte por periodo y destinatario, aunque el worker se reinicie a mitad.
        idempotencyKey: `report:${report.id}:${period.fromDate}:${to}`,
        payloadJson:
          report.channel === "email"
            ? {
                subject,
                body: content.text,
                attachments: [
                  {
                    filename: `reporte-${period.fromDate}.csv`,
                    type: "text/csv",
                    content: Buffer.from(content.csv, "utf8").toString(
                      "base64",
                    ),
                  },
                ],
              }
            : { message: content.text },
      },
    ];
  });

  await prisma.$transaction([
    prisma.notificationOutbox.createMany({ data: rows, skipDuplicates: true }),
    prisma.scheduledReport.update({
      where: { id: report.id },
      data: {
        lastSentAt: now,
        lastError: null,
        nextRunAt: nextReportRun(frequency, now, tenant.timezone),
      },
    }),
  ]);
  return rows.length;
}

/**
 * Genera los reportes programados que tocan. Un reporte sin fecha de proxima ejecucion se
 * agenda (no se envia en el momento); uno no disponible para el negocio registra el motivo.
 */
export async function runScheduledReports(
  prisma: PrismaClient,
  now = new Date(),
) {
  const reports = await prisma.scheduledReport.findMany({
    where: {
      enabled: true,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
    include: { tenant: { include: tenantContext } },
    take: 50,
  });

  let sent = 0;
  for (const { tenant, ...report } of reports) {
    if (!isReportFrequency(report.frequency)) {
      continue;
    }
    if (!report.nextRunAt) {
      await prisma.scheduledReport.update({
        where: { id: report.id },
        data: {
          nextRunAt: nextReportRun(report.frequency, now, tenant.timezone),
        },
      });
      continue;
    }
    const unavailable = reportUnavailableReason(tenant, now);
    if (unavailable) {
      await prisma.scheduledReport.update({
        where: { id: report.id },
        data: {
          lastError: unavailable,
          nextRunAt: nextReportRun(report.frequency, now, tenant.timezone),
        },
      });
      continue;
    }
    sent += await sendReport(prisma, report, tenant, report.frequency, now);
  }
  return sent;
}
