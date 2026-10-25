import React, { useState, useMemo } from "react";
import {
  Appointment,
  Professional,
  Service,
  Client,
  AppointmentStatus,
} from "../types";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  User,
  Scissors,
  DollarSign,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AgendaProps {
  appointments: Appointment[];
  professionals: Professional[];
  services: Service[];
  clients: Client[];
  onAddAppointment: (appointment: Omit<Appointment, "id">) => void;
  onUpdateAppointmentStatus: (id: string, status: AppointmentStatus) => void;
  onDeleteAppointment: (id: string) => void;
}

function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function Agenda({
  appointments,
  professionals,
  services,
  clients,
  onAddAppointment,
  onUpdateAppointmentStatus,
  onDeleteAppointment,
}: AgendaProps) {
  const [currentAnchorDate, setCurrentAnchorDate] = useState<Date>(
    () => new Date(),
  );
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  // New appointment form state
  const [newClientId, setNewClientId] = useState("");
  const [newServiceId, setNewServiceId] = useState("");
  const [newProfessionalId, setNewProfessionalId] = useState("");
  const [newDate, setNewDate] = useState(() => localDateString());
  const [newTime, setNewTime] = useState("12:00");

  // Calculate the start of the week (Sunday) for the current anchor date
  const weekDays = useMemo(() => {
    const startOfWeek = new Date(currentAnchorDate);
    const dayOfWeek = startOfWeek.getDay(); // 0: Sunday, 1: Monday...
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

    const days: {
      date: Date;
      dateString: string;
      label: string;
      isToday: boolean;
    }[] = [];
    const labels = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateString = localDateString(d);
      const isToday = dateString === localDateString();
      days.push({
        date: d,
        dateString,
        label: `${labels[i]} ${d.getDate()}/${d.getMonth() + 1}`,
        isToday,
      });
    }
    return days;
  }, [currentAnchorDate]);

  // Header period label (e.g., "12 – 18 jul 2026")
  const periodLabel = useMemo(() => {
    const start = weekDays[0].date;
    const end = weekDays[6].date;
    const monthNames = [
      "ene",
      "feb",
      "mar",
      "abr",
      "may",
      "jun",
      "jul",
      "ago",
      "sep",
      "oct",
      "nov",
      "dic",
    ];
    const startMonth = monthNames[start.getMonth()];
    const endMonth = monthNames[end.getMonth()];

    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()} – ${end.getDate()} ${startMonth} ${start.getFullYear()}`;
    }
    return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth} ${start.getFullYear()}`;
  }, [weekDays]);

  // Hours of the day to render in calendar grid (7:00 to 20:00)
  const hours = Array.from({ length: 14 }, (_, i) => i + 7);

  const navigateWeek = (direction: "next" | "prev") => {
    const newAnchor = new Date(currentAnchorDate);
    newAnchor.setDate(
      currentAnchorDate.getDate() + (direction === "next" ? 7 : -7),
    );
    setCurrentAnchorDate(newAnchor);
  };

  const jumpToToday = () => {
    setCurrentAnchorDate(new Date());
  };

  // Map appointment matches to cells
  const getAppointmentForSlot = (dateString: string, hour: number) => {
    return appointments.find((app) => {
      const [appHourStr] = app.time.split(":");
      const appHour = parseInt(appHourStr);
      return app.date === dateString && appHour === hour;
    });
  };

  const handleCellClick = (dateString: string, hour: number) => {
    const existing = getAppointmentForSlot(dateString, hour);
    if (existing) {
      setSelectedAppointment(existing);
    } else {
      setNewDate(dateString);
      setNewTime(`${hour.toString().padStart(2, "0")}:00`);
      if (clients.length > 0) setNewClientId(clients[0].id);
      if (services.length > 0) setNewServiceId(services[0].id);
      if (professionals.length > 0) setNewProfessionalId(professionals[0].id);
      setIsNewModalOpen(true);
    }
  };

  const submitNewAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === newClientId);
    const service = services.find((s) => s.id === newServiceId);
    const professional = professionals.find((p) => p.id === newProfessionalId);

    if (!client || !service || !professional) return;

    onAddAppointment({
      clientId: client.id,
      clientName: client.name,
      clientPhone: client.phone,
      clientEmail: client.email,
      serviceId: service.id,
      serviceName: service.name,
      professionalId: professional.id,
      professionalName: professional.name,
      date: newDate,
      time: newTime,
      status: "confirmed",
      price: service.price,
      duration: service.duration,
    });

    setIsNewModalOpen(false);
  };

  const getStatusBadge = (status: AppointmentStatus) => {
    const styles = {
      completed: "bg-emerald-950/60 text-emerald-300 border-emerald-800/40",
      confirmed: "bg-blue-950/60 text-blue-300 border-blue-800/40",
      pending: "bg-amber-950/60 text-amber-300 border-amber-800/40",
      cancelled: "bg-rose-950/60 text-rose-300 border-rose-800/40",
      no_show: "bg-zinc-800 text-zinc-400 border-zinc-700/50",
    };
    const labels = {
      completed: "Completada",
      confirmed: "Confirmada",
      pending: "Pendiente",
      cancelled: "Cancelada",
      no_show: "No Show",
    };
    return (
      <span
        className={`px-2.5 py-1 text-xs font-bold rounded-full border ${styles[status]}`}
      >
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#121212]/50 backdrop-blur-md p-5 rounded-2xl border border-[#2a2a2a]">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-sans">
            Agenda Operativa
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            Gestión de turnos semanales y estados de citas
          </p>
        </div>

        <button
          onClick={() => {
            if (clients.length > 0) setNewClientId(clients[0].id);
            if (services.length > 0) setNewServiceId(services[0].id);
            if (professionals.length > 0)
              setNewProfessionalId(professionals[0].id);
            setIsNewModalOpen(true);
          }}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-md transition-all uppercase tracking-wider cursor-pointer border border-blue-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>NUEVA CITA</span>
        </button>
      </div>

      {/* Navigation and Date Picker Row */}
      <div className="flex justify-between items-center bg-[#141414] p-3 rounded-xl border border-[#2a2a2a]">
        <h2 className="text-base font-bold text-white font-sans tracking-tight">
          {periodLabel}
        </h2>

        <div className="flex items-center space-x-2">
          <button
            onClick={jumpToToday}
            className="px-3.5 py-1.5 text-xs font-semibold text-gray-300 hover:text-white border border-[#2a2a2a] rounded-lg bg-[#1a1a1a] hover:bg-[#222]"
          >
            Hoy
          </button>
          <button
            onClick={() => navigateWeek("prev")}
            className="p-1.5 border border-[#2a2a2a] rounded-lg text-gray-400 bg-[#1a1a1a] hover:bg-[#222] hover:text-white"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigateWeek("next")}
            className="p-1.5 border border-[#2a2a2a] rounded-lg text-gray-400 bg-[#1a1a1a] hover:bg-[#222] hover:text-white"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid Table */}
      <div className="bg-[#141414] rounded-2xl border border-[#2a2a2a] shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
              <th className="w-16 p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">
                Hora
              </th>
              {weekDays.map((day) => (
                <th
                  key={day.dateString}
                  className={`p-3 text-xs font-bold border-l border-[#2a2a2a] text-center ${
                    day.isToday
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-gray-300"
                  }`}
                >
                  <span className="uppercase tracking-wide font-sans">
                    {day.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((hour) => (
              <tr
                key={hour}
                className="border-b border-[#2a2a2a] hover:bg-[#1a1a1a]/20 transition-all"
              >
                {/* Hour indicator column */}
                <td className="p-3 text-xs font-bold text-gray-500 text-center select-none bg-[#161616]">
                  {hour}:00
                </td>

                {/* Day cells */}
                {weekDays.map((day) => {
                  const appointment = getAppointmentForSlot(
                    day.dateString,
                    hour,
                  );
                  return (
                    <td
                      key={`${day.dateString}-${hour}`}
                      onClick={() => handleCellClick(day.dateString, hour)}
                      className={`p-2 border-l border-[#2a2a2a] align-top min-h-[50px] relative transition-colors cursor-pointer ${
                        day.isToday
                          ? "bg-blue-500/5 hover:bg-blue-500/10"
                          : "hover:bg-[#1a1a1a]/30"
                      }`}
                    >
                      {appointment ? (
                        <motion.div
                          layoutId={`app-card-${appointment.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAppointment(appointment);
                          }}
                          className={`p-2 rounded-xl border text-left shadow-sm flex flex-col justify-between h-full select-none ${
                            appointment.status === "completed"
                              ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-300"
                              : appointment.status === "cancelled"
                                ? "bg-rose-950/40 border-rose-800/40 text-rose-400 line-through opacity-70"
                                : appointment.status === "no_show"
                                  ? "bg-zinc-800/95 border-zinc-700/60 text-zinc-400"
                                  : "bg-blue-950/40 border-blue-800/40 text-blue-300"
                          }`}
                        >
                          <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-wide truncate opacity-90">
                              {appointment.serviceName}
                            </p>
                            <p className="text-xs font-bold truncate mt-0.5">
                              {appointment.clientName}
                            </p>
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/10 text-[9px] font-bold opacity-80">
                            <span className="truncate">
                              {appointment.professionalName}
                            </span>
                            <span className="font-extrabold text-white">
                              ${appointment.price.toFixed(0)}
                            </span>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="h-8 flex items-center justify-center opacity-0 hover:opacity-100 text-gray-600 text-xs transition-opacity select-none">
                          <Plus className="w-4 h-4" />
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL: APPOINTMENT DETAILS & STATUS UPDATER */}
      <AnimatePresence>
        {selectedAppointment && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#141414] rounded-2xl border border-[#2a2a2a] w-full max-w-md shadow-2xl overflow-hidden text-gray-200"
            >
              <div className="bg-[#1a1a1a] p-5 flex justify-between items-center border-b border-[#2a2a2a]">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400">
                    Detalle de cita
                  </span>
                  <h3 className="text-lg font-bold font-sans tracking-tight text-white">
                    {selectedAppointment.serviceName}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedAppointment(null)}
                  className="p-1.5 rounded-full bg-[#222] hover:bg-[#333] text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Client Info Card */}
                <div className="flex items-start space-x-3 p-3 bg-[#121212] rounded-xl border border-[#2a2a2a]">
                  <User className="w-5 h-5 text-gray-500 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {selectedAppointment.clientName}
                    </h4>
                    <p className="text-xs text-gray-400 font-medium mt-0.5">
                      Tel: {selectedAppointment.clientPhone}
                    </p>
                    {selectedAppointment.clientEmail && (
                      <p className="text-xs text-gray-400 font-medium">
                        Email: {selectedAppointment.clientEmail}
                      </p>
                    )}
                  </div>
                </div>

                {/* Appointment Metadata Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs text-gray-300">
                  <div className="p-3 bg-[#121212] rounded-xl border border-[#2a2a2a] flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <div>
                      <span className="text-[9px] font-bold text-gray-500 uppercase block">
                        Hora y Fecha
                      </span>
                      <span className="font-bold text-white">
                        {selectedAppointment.date} {selectedAppointment.time}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-[#121212] rounded-xl border border-[#2a2a2a] flex items-center space-x-2">
                    <Scissors className="w-4 h-4 text-purple-400" />
                    <div>
                      <span className="text-[9px] font-bold text-gray-500 uppercase block">
                        Profesional
                      </span>
                      <span className="font-bold text-white">
                        {selectedAppointment.professionalName}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-[#121212] rounded-xl border border-[#2a2a2a] flex items-center space-x-2">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="text-[9px] font-bold text-gray-500 uppercase block">
                        Monto total
                      </span>
                      <span className="font-bold text-white">
                        ${selectedAppointment.price.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-[#121212] rounded-xl border border-[#2a2a2a] flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <div>
                      <span className="text-[9px] font-bold text-gray-500 uppercase block">
                        Duración
                      </span>
                      <span className="font-bold text-white">
                        {selectedAppointment.duration} minutos
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status indicator row */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Estado actual
                  </span>
                  {getStatusBadge(selectedAppointment.status)}
                </div>

                {/* State Controls Form */}
                <div className="space-y-2 pt-3 border-t border-[#2a2a2a]">
                  <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest block font-sans">
                    Cambiar estado
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        "confirmed",
                        "completed",
                        "no_show",
                        "cancelled",
                      ] as AppointmentStatus[]
                    ).map((status) => {
                      const labels = {
                        confirmed: "Confirmar",
                        completed: "Completar",
                        no_show: "No Show",
                        cancelled: "Cancelar",
                        pending: "Pendiente",
                      };
                      const isCurrent = selectedAppointment.status === status;
                      return (
                        <button
                          key={status}
                          onClick={() => {
                            onUpdateAppointmentStatus(
                              selectedAppointment.id,
                              status,
                            );
                            setSelectedAppointment((prev) =>
                              prev ? { ...prev, status } : null,
                            );
                          }}
                          className={`px-2.5 py-2 text-[10px] font-bold rounded-xl border text-center transition-all cursor-pointer ${
                            isCurrent
                              ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                              : "bg-[#1a1a1a] text-gray-300 border-[#2a2a2a] hover:bg-[#222]"
                          }`}
                        >
                          {labels[status]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Destructive Delete Button */}
                <button
                  onClick={() => {
                    const confirmDel = window.confirm(
                      "¿Estás seguro de que deseas eliminar permanentemente esta cita de la agenda?",
                    );
                    if (confirmDel) {
                      onDeleteAppointment(selectedAppointment.id);
                      setSelectedAppointment(null);
                    }
                  }}
                  className="w-full text-center text-xs font-bold text-rose-400 hover:text-rose-300 border border-dashed border-rose-950 hover:bg-rose-950/15 rounded-xl py-3 mt-4 transition-all cursor-pointer"
                >
                  ELIMINAR CITA DE LA AGENDA
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: NEW APPOINTMENT CREATOR */}
      <AnimatePresence>
        {isNewModalOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#141414] rounded-2xl border border-[#2a2a2a] w-full max-w-md shadow-2xl overflow-hidden text-gray-200"
            >
              <div className="bg-[#1a1a1a] p-5 flex justify-between items-center border-b border-[#2a2a2a]">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400">
                    Nueva cita
                  </span>
                  <h3 className="text-lg font-bold font-sans tracking-tight text-white">
                    Agendar cita manual
                  </h3>
                </div>
                <button
                  onClick={() => setIsNewModalOpen(false)}
                  className="p-1.5 rounded-full bg-[#222] hover:bg-[#333] text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={submitNewAppointment} className="p-5 space-y-4">
                {/* Client selection */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block">
                    Cliente
                  </label>
                  <select
                    value={newClientId}
                    onChange={(e) => setNewClientId(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 text-sm text-gray-200 focus:border-blue-500 outline-none font-sans font-medium"
                    required
                  >
                    <option value="" disabled className="bg-[#141414]">
                      Selecciona un cliente
                    </option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[#141414]">
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Service Selection */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block">
                    Servicio
                  </label>
                  <select
                    value={newServiceId}
                    onChange={(e) => setNewServiceId(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 text-sm text-gray-200 focus:border-blue-500 outline-none font-sans font-medium"
                    required
                  >
                    <option value="" disabled className="bg-[#141414]">
                      Selecciona el servicio
                    </option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id} className="bg-[#141414]">
                        {s.name} - {s.duration} min (${s.price})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Professional Selection */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block">
                    Profesional
                  </label>
                  <select
                    value={newProfessionalId}
                    onChange={(e) => setNewProfessionalId(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 text-sm text-gray-200 focus:border-blue-500 outline-none font-sans font-medium"
                    required
                  >
                    <option value="" disabled className="bg-[#141414]">
                      Selecciona un profesional
                    </option>
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id} className="bg-[#141414]">
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date & Time fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block">
                      Fecha
                    </label>
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 text-sm text-gray-200 focus:border-blue-500 outline-none font-sans font-medium"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block">
                      Hora
                    </label>
                    <input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 text-sm text-gray-200 focus:border-blue-500 outline-none font-sans font-medium"
                      required
                    />
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex space-x-3 pt-4 border-t border-[#2a2a2a]">
                  <button
                    type="button"
                    onClick={() => setIsNewModalOpen(false)}
                    className="w-1/2 text-center text-xs font-bold text-gray-400 hover:bg-[#222] rounded-xl py-3.5 transition-all"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 text-center text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3.5 transition-all shadow-md border border-blue-500/20"
                  >
                    CONFIRMAR CITA
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
