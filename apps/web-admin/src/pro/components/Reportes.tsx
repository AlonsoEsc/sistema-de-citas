import React, { useState, useMemo } from "react";
import { Appointment, Professional, Service, ScheduledReport } from "../types";
import {
  FileSpreadsheet,
  FileText,
  Calendar,
  Filter,
  Plus,
  Trash2,
  Clock,
  Check,
} from "lucide-react";
import { PRODUCT_NAME } from "../../config/brand";

interface ReportesProps {
  appointments: Appointment[];
  professionals: Professional[];
  services: Service[];
  scheduledReports: ScheduledReport[];
  onAddScheduledReport: (report: Omit<ScheduledReport, "id">) => void;
  onDeleteScheduledReport: (id: string) => void;
}

function localDateString(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function Reportes({
  appointments,
  professionals,
  services,
  scheduledReports,
  onAddScheduledReport,
  onDeleteScheduledReport,
}: ReportesProps) {
  // Filter States
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return localDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    return localDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  });
  const [filterProf, setFilterProf] = useState("all");
  const [filterSrv, setFilterSrv] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // New scheduled report state
  const [schedName, setSchedName] = useState("");
  const [schedFreq, setSchedFreq] = useState<"daily" | "weekly" | "monthly">(
    "weekly",
  );
  const [schedRecipients, setSchedRecipients] = useState("admin@demo.com");
  const [schedFormat, setSchedFormat] = useState<"pdf" | "excel" | "both">(
    "pdf",
  );
  const [schedChannel, setSchedChannel] = useState<"email" | "whatsapp">(
    "email",
  );

  // Trigger notice
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  // Filter logic
  const filteredData = useMemo(() => {
    return appointments
      .filter((app) => {
        const matchStart = app.date >= startDate;
        const matchEnd = app.date <= endDate;
        const matchProf =
          filterProf === "all" || app.professionalId === filterProf;
        const matchSrv = filterSrv === "all" || app.serviceId === filterSrv;
        const matchStatus =
          filterStatus === "all" || app.status === filterStatus;

        return matchStart && matchEnd && matchProf && matchSrv && matchStatus;
      })
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
      );
  }, [appointments, startDate, endDate, filterProf, filterSrv, filterStatus]);

  // Calculations
  const totals = useMemo(() => {
    const totalCount = filteredData.length;
    const completedCount = filteredData.filter(
      (a) => a.status === "completed",
    ).length;
    const activeIncome = filteredData
      .filter((a) => a.status === "completed" || a.status === "confirmed")
      .reduce((sum, a) => sum + a.price, 0);

    const projectedIncome = filteredData.reduce((sum, a) => sum + a.price, 0);

    return {
      totalCount,
      completedCount,
      activeIncome,
      projectedIncome,
    };
  }, [filteredData]);

  // Export as EXCEL (CSV formatting with proper Spanish UTF-8 BOM)
  const exportToExcel = () => {
    if (filteredData.length === 0) {
      alert("No hay datos en el reporte actual para exportar.");
      return;
    }

    const headers = [
      "Fecha",
      "Hora",
      "Cliente",
      "Teléfono",
      "Servicio",
      "Profesional",
      "Estado",
      "Monto ($)",
      "Duración (min)",
    ];
    const rows = filteredData.map((app) => [
      app.date,
      app.time,
      app.clientName,
      app.clientPhone,
      app.serviceName,
      app.professionalName,
      app.status.toUpperCase(),
      app.price.toFixed(2),
      app.duration,
    ]);

    // Construct CSV file with UTF-8 BOM so Excel opens accents correctly
    const csvContent =
      "\uFEFF" +
      [
        headers.join(","),
        ...rows.map((e) => e.map((val) => `"${val}"`).join(",")),
      ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `agenda_pro_reporte_${startDate}_a_${endDate}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotice("📊 ¡Reporte de Excel generado y descargado con éxito!");
  };

  // Export to PDF (Printeable popup layout for vectors)
  const exportToPDF = () => {
    if (filteredData.length === 0) {
      alert("No hay datos en el reporte actual para exportar.");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert(
        "Por favor, permite ventanas emergentes para exportar el reporte a PDF.",
      );
      return;
    }

    const tableRows = filteredData
      .map(
        (app) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px; font-size: 11px;">${app.date}</td>
        <td style="padding: 10px; font-size: 11px;">${app.time}</td>
        <td style="padding: 10px; font-size: 11px; font-weight: bold;">${app.clientName}</td>
        <td style="padding: 10px; font-size: 11px;">${app.serviceName}</td>
        <td style="padding: 10px; font-size: 11px;">${app.professionalName}</td>
        <td style="padding: 10px; font-size: 10px; text-transform: uppercase; font-weight: bold; color: ${app.status === "completed" ? "#059669" : "#d97706"}">${app.status}</td>
        <td style="padding: 10px; font-size: 11px; font-weight: bold; text-align: right;">$${app.price.toFixed(2)}</td>
      </tr>
    `,
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte de Citas - ${PRODUCT_NAME}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: bold; }
            .meta { font-size: 12px; color: #64748b; line-height: 1.6; }
            .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
            .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; }
            .stat-label { font-size: 10px; font-weight: bold; color: #94a3b8; text-transform: uppercase; }
            .stat-value { font-size: 18px; font-weight: bold; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f1f5f9; padding: 12px; font-size: 11px; font-weight: bold; text-align: left; border-bottom: 1px solid #cbd5e1; }
            td { border-bottom: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">${PRODUCT_NAME}</div>
              <div style="font-size: 13px; color: #0d9488; font-weight: bold;">Reporte Comercial y Operativo</div>
            </div>
            <div class="meta" style="text-align: right;">
              <div>Rango: <strong>${startDate} al ${endDate}</strong></div>
              <div>Generado: ${new Date().toLocaleDateString("es-ES")}</div>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Citas totales</div>
              <div class="stat-value">${totals.totalCount}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Citas completadas</div>
              <div class="stat-value">${totals.completedCount}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Ingresos cobrados</div>
              <div class="stat-value">$${totals.activeIncome.toFixed(2)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Proyección total</div>
              <div class="stat-value">$${totals.projectedIncome.toFixed(2)}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Profesional</th>
                <th>Estado</th>
                <th style="text-align: right;">Precio</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div style="margin-top: 40px; font-size: 10px; text-align: center; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 10px;">
            Documento de control administrativo ${PRODUCT_NAME}. Todos los derechos reservados.
          </div>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    showNotice("📄 ¡Reporte PDF preparado para impresión o guardado!");
  };

  const submitScheduledReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedName.trim()) return;

    onAddScheduledReport({
      name: schedName.trim(),
      frequency: schedFreq,
      recipients: schedRecipients.split(",").map((r) => r.trim()),
      format: schedFormat,
      channel: schedChannel,
      enabled: true,
    });

    setSchedName("");
    showNotice("⏰ ¡Reporte programado configurado con éxito!");
  };

  return (
    <div className="space-y-6">
      {/* Notice Feed Toast */}
      {actionNotice && (
        <div className="fixed bottom-6 right-6 bg-[#121212] text-white px-5 py-3.5 rounded-2xl border border-[#2a2a2a] shadow-2xl z-50 flex items-center space-x-3 text-xs font-semibold">
          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-[10px]">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#121212]/50 backdrop-blur-md p-5 rounded-2xl border border-[#2a2a2a]">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-sans">
            Reportes & Exportación
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            Analiza el rendimiento del salón y exporta informes listos para
            contabilidad
          </p>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-[#141414] p-5 rounded-2xl border border-[#2a2a2a] shadow-sm space-y-4">
        <div className="flex items-center space-x-2 text-white">
          <Filter className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-bold uppercase tracking-wide">
            Filtros Avanzados
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Start Date */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
              Desde
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
              />
            </div>
          </div>

          {/* End Date */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
              Hasta
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
              />
            </div>
          </div>

          {/* Professional */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
              Profesional
            </label>
            <select
              value={filterProf}
              onChange={(e) => setFilterProf(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-2.5 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
            >
              <option value="all" className="bg-[#141414]">
                Todos
              </option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#141414]">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Service */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
              Servicio
            </label>
            <select
              value={filterSrv}
              onChange={(e) => setFilterSrv(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-2.5 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
            >
              <option value="all" className="bg-[#141414]">
                Todos
              </option>
              {services.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#141414]">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
              Estado de cita
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-2.5 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
            >
              <option value="all" className="bg-[#141414]">
                Todos
              </option>
              <option value="completed" className="bg-[#141414]">
                Completadas
              </option>
              <option value="confirmed" className="bg-[#141414]">
                Confirmadas
              </option>
              <option value="no_show" className="bg-[#141414]">
                No Show
              </option>
              <option value="cancelled" className="bg-[#141414]">
                Canceladas
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Statistics Summaries & Export buttons */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#121212] text-white p-5 rounded-2xl shadow-lg border border-[#2a2a2a]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full md:w-auto">
          <div>
            <span className="text-[9px] font-bold text-gray-500 uppercase block tracking-wider">
              Citas Encontradas
            </span>
            <span className="text-xl font-extrabold">{totals.totalCount}</span>
          </div>
          <div className="border-l border-[#2a2a2a] pl-4">
            <span className="text-[9px] font-bold text-gray-500 uppercase block tracking-wider">
              Completadas
            </span>
            <span className="text-xl font-extrabold text-blue-400">
              {totals.completedCount}
            </span>
          </div>
          <div className="border-l border-[#2a2a2a] pl-4">
            <span className="text-[9px] font-bold text-gray-500 uppercase block tracking-wider">
              Ingresos Reales
            </span>
            <span className="text-xl font-extrabold text-emerald-400">
              ${totals.activeIncome.toFixed(2)}
            </span>
          </div>
          <div className="border-l border-[#2a2a2a] pl-4">
            <span className="text-[9px] font-bold text-gray-500 uppercase block tracking-wider">
              Proyección Total
            </span>
            <span className="text-xl font-extrabold text-amber-400">
              ${totals.projectedIncome.toFixed(2)}
            </span>
          </div>
        </div>

        {/* EXPORT ACTION BUTTONS */}
        <div className="flex space-x-2 w-full md:w-auto">
          <button
            onClick={exportToExcel}
            className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-md transition-all uppercase tracking-wider cursor-pointer border border-emerald-500/20"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>EXCEL</span>
          </button>
          <button
            onClick={exportToPDF}
            className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-md transition-all uppercase tracking-wider cursor-pointer border border-blue-500/20"
          >
            <FileText className="w-4 h-4" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Grid: Preview Table & Scheduled reports configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table Preview (2 Cols) */}
        <div className="lg:col-span-2 bg-[#141414] p-5 rounded-2xl border border-[#2a2a2a] shadow-sm space-y-3 overflow-hidden">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">
            Previsualización de registros ({filteredData.length})
          </h3>
          <div className="overflow-x-auto max-h-[350px] overflow-y-auto pr-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                  <th className="p-3 font-bold text-gray-500 uppercase tracking-wider">
                    Fecha / Hora
                  </th>
                  <th className="p-3 font-bold text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="p-3 font-bold text-gray-500 uppercase tracking-wider">
                    Servicio / Prof.
                  </th>
                  <th className="p-3 font-bold text-gray-500 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="p-3 font-bold text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((app) => (
                  <tr
                    key={app.id}
                    className="border-b border-[#2a2a2a] hover:bg-[#1a1a1a]/40 transition-colors"
                  >
                    <td className="p-3">
                      <span className="font-bold text-gray-200 block">
                        {app.date}
                      </span>
                      <span className="text-[10px] text-gray-400 font-semibold">
                        {app.time}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-white block">
                        {app.clientName}
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {app.clientPhone}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-gray-200 block">
                        {app.serviceName}
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {app.professionalName}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-white">
                      ${app.price.toFixed(2)}
                    </td>
                    <td className="p-3 uppercase">
                      <span
                        className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                          app.status === "completed"
                            ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/40"
                            : app.status === "cancelled"
                              ? "bg-rose-950/40 text-rose-300 border-rose-800/40"
                              : "bg-blue-950/40 text-blue-300 border-blue-800/40"
                        }`}
                      >
                        {app.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-500">
                      No hay citas en este rango con los filtros seleccionados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scheduled Automated Reports Panel */}
        <div className="bg-[#141414] p-5 rounded-2xl border border-[#2a2a2a] shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-white">
            <Clock className="w-5 h-5 text-indigo-400 animate-pulse" />
            <h3 className="text-sm font-bold uppercase tracking-wide">
              Reportes Automáticos
            </h3>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed font-medium">
            Programa informes automatizados para que se envíen de manera
            periódica a tu correo o teléfono.
          </p>

          <form
            onSubmit={submitScheduledReport}
            className="space-y-3 p-3 bg-[#121212] rounded-xl border border-[#2a2a2a]"
          >
            <div>
              <label className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest block mb-1">
                Nombre de la regla
              </label>
              <input
                type="text"
                placeholder="Ej. Resumen Mensual de Ventas"
                value={schedName}
                onChange={(e) => setSchedName(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs font-sans font-medium text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest block mb-1">
                  Frecuencia
                </label>
                <select
                  value={schedFreq}
                  onChange={(e) =>
                    setSchedFreq(
                      e.target.value as "daily" | "weekly" | "monthly",
                    )
                  }
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-2 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
                >
                  <option value="daily" className="bg-[#141414]">
                    Diario
                  </option>
                  <option value="weekly" className="bg-[#141414]">
                    Semanal
                  </option>
                  <option value="monthly" className="bg-[#141414]">
                    Mensual
                  </option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest block mb-1">
                  Canal de envío
                </label>
                <select
                  value={schedChannel}
                  onChange={(e) =>
                    setSchedChannel(e.target.value as "email" | "whatsapp")
                  }
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-2 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
                >
                  <option value="email" className="bg-[#141414]">
                    Gmail (Correo)
                  </option>
                  <option value="whatsapp" className="bg-[#141414]">
                    WhatsApp
                  </option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest block mb-1">
                  Destinatarios (separados por coma)
                </label>
                <input
                  type="text"
                  placeholder="Ej. admin@demo.com, andrea@demo.com"
                  value={schedRecipients}
                  onChange={(e) => setSchedRecipients(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs font-sans font-medium text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest block mb-1">
                Formato de adjunto
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["pdf", "excel", "both"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setSchedFormat(fmt)}
                    className={`px-2 py-1.5 text-[10px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                      schedFormat === fmt
                        ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                        : "bg-[#1a1a1a] text-gray-300 border-[#2a2a2a] hover:bg-[#222]"
                    }`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all uppercase tracking-wider flex items-center justify-center space-x-1 cursor-pointer border border-blue-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>CREAR PROGRAMACIÓN</span>
            </button>
          </form>

          {/* List of scheduled reports */}
          <div className="space-y-2 mt-4 pt-4 border-t border-[#2a2a2a]">
            <span className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest block mb-2">
              Programaciones Activas ({scheduledReports.length})
            </span>
            {scheduledReports.map((sr) => (
              <div
                key={sr.id}
                className="p-3 bg-[#1a1a1a]/55 border border-[#2a2a2a]/60 rounded-xl flex items-start justify-between transition-all"
              >
                <div>
                  <h4 className="text-xs font-bold text-gray-200">{sr.name}</h4>
                  <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">
                    Frecuencia: {sr.frequency} • Adjuntos:{" "}
                    {sr.format.toUpperCase()}
                  </p>
                  <p className="text-[9px] text-gray-500 font-medium truncate max-w-[170px]">
                    Enviar vía {sr.channel} a {sr.recipients.join(", ")}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        `¿Quieres borrar la regla de reporte automático "${sr.name}"?`,
                      )
                    ) {
                      onDeleteScheduledReport(sr.id);
                    }
                  }}
                  className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-lg transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
