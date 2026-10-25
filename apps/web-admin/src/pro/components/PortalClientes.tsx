import React, { useState, useMemo } from 'react';
import { Appointment, Professional, Service, Client } from '../types';
import { Smartphone, CheckCircle, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PortalClientesProps {
  appointments: Appointment[];
  professionals: Professional[];
  services: Service[];
  clients: Client[];
  onAddAppointment: (appointment: Omit<Appointment, 'id'>) => void;
  onAddClient: (client: Omit<Client, 'id'>) => void;
  onCancelAppointment: (id: string) => void;
}

function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function PortalClientes({
  appointments,
  professionals,
  services,
  clients,
  onAddAppointment,
  onAddClient,
  onCancelAppointment
}: PortalClientesProps) {
  // Wizard steps: 'login' | 'otp' | 'menu' | 'new_appointment' | 'cancel_appointment'
  const [step, setStep] = useState<'login' | 'otp' | 'menu' | 'new_appointment' | 'cancel_appointment'>('login');

  // Login form state
  const [phone, setPhone] = useState('76153585');
  const [fullName, setFullName] = useState('Alonso Escobar');
  const [email, setEmail] = useState('lonsoesc99@gmail.com');

  // OTP state
  const devOTP = '932937';
  const [inputOTP, setInputOTP] = useState('');
  const [otpError, setOtpError] = useState(false);

  // Active user session
  const [currentUser, setCurrentUser] = useState<Client | null>(null);

  // Booking states
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedProf, setSelectedProf] = useState<Professional | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => localDateString());
  const [selectedTime, setSelectedTime] = useState('');

  // Toast success feedback
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter user active appointments
  const userAppointments = useMemo(() => {
    if (!currentUser) return [];
    return appointments.filter(a => a.clientId === currentUser.id || a.clientPhone === currentUser.phone);
  }, [appointments, currentUser]);

  // Generate available time slots
  const availableSlots = useMemo(() => {
    if (!selectedService || !selectedProf) return [];

    // Base time slots (every 15 min from 09:00 to 18:00)
    const times = [
      '09:00', '09:15', '09:30', '09:45',
      '10:00', '10:15', '10:30', '10:45',
      '11:00', '11:15', '11:30', '11:45',
      '12:00', '12:15', '12:30', '12:45',
      '13:00', '13:15', '13:30', '13:45',
      '15:00', '15:15', '15:30', '15:45',
      '16:00', '16:15', '16:30', '16:45',
      '17:00', '17:15', '17:30', '17:45',
      '18:00', '18:15'
    ];

    // Find slots that conflict with existing appointments on the selected date & professional
    const bookedTimes = appointments
      .filter(app => app.date === selectedDate && app.professionalId === selectedProf.id && app.status !== 'cancelled')
      .map(app => app.time);

    // Return remaining available slots
    return times.filter(t => !bookedTimes.includes(t));
  }, [selectedService, selectedProf, selectedDate, appointments]);

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;

    // Register or retrieve user profile
    const existingClient = clients.find(c => c.phone.trim() === phone.trim());
    if (!existingClient) {
      // Register new client profile
      const newCli = {
        name: fullName.trim() || 'Cliente Anónimo',
        phone: phone.trim(),
        email: email.trim() || `${phone.trim()}@temp.com`
      };
      onAddClient(newCli);
    }

    setStep('otp');
    setInputOTP('');
    setOtpError(false);
  };

  const handleVerifyOTP = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputOTP === devOTP) {
      // Find logged in client
      const clientProfile = clients.find(c => c.phone.trim() === phone.trim()) || {
        id: 'temp_user',
        name: fullName,
        phone: phone,
        email: email
      };
      setCurrentUser(clientProfile);
      setStep('menu');
    } else {
      setOtpError(true);
    }
  };

  const handleConfirmAppointment = () => {
    if (!currentUser || !selectedService || !selectedProf || !selectedTime) return;

    onAddAppointment({
      clientId: currentUser.id,
      clientName: currentUser.name,
      clientPhone: currentUser.phone,
      clientEmail: currentUser.email,
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      professionalId: selectedProf.id,
      professionalName: selectedProf.name,
      date: selectedDate,
      time: selectedTime,
      status: 'confirmed',
      price: selectedService.price,
      duration: selectedService.duration
    });

    setSuccessMsg('Cita confirmada correctamente.');
    setSelectedTime('');
    setStep('menu');
  };

  const handleCancelClick = (id: string) => {
    const confirmCancel = window.confirm('¿Seguro que deseas cancelar esta reserva?');
    if (confirmCancel) {
      onCancelAppointment(id);
      setSuccessMsg('Cita cancelada con éxito.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Visual Launcher Badge */}
      <div className="flex items-center space-x-2 text-blue-400 bg-blue-950/20 border border-blue-800/30 p-3 rounded-xl">
        <Smartphone className="w-5 h-5 animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-wider">Simulador del Portal de Reservas de Clientes</span>
      </div>

      <div className="bg-[#141414] border border-[#2a2a2a] shadow-2xl rounded-3xl overflow-hidden min-h-[500px] flex flex-col">
        {/* Portal Header */}
        <div className="bg-[#121212] border-b border-[#2a2a2a] p-6 relative">
          <div className="space-y-1">
            <h2 className="text-xl font-bold font-sans tracking-tight text-white">Reserva en 2 minutos</h2>
            <p className="text-xs text-gray-400 font-medium">Acceso sin password con verificación por teléfono.</p>
          </div>
          {currentUser && (
            <div className="mt-4 pt-3 border-t border-[#2a2a2a] flex justify-between items-center text-xs">
              <span className="text-gray-300 font-medium">
                Sesión activa: <strong className="text-white">{currentUser.name}</strong> ({currentUser.phone})
              </span>
              <button
                onClick={() => {
                  setCurrentUser(null);
                  setStep('login');
                }}
                className="text-blue-400 hover:underline font-bold cursor-pointer"
              >
                Cerrar Sesión
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Success alerts */}
        {successMsg && (
          <div className="bg-emerald-950/40 border-b border-emerald-800/40 text-emerald-300 p-4 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-200 font-bold hover:underline cursor-pointer">Aceptar</button>
          </div>
        )}

        {/* STEP CONTROLS CONTAINER */}
        <div className="p-6 flex-1 flex flex-col justify-between">
          <AnimatePresence mode="wait">
            {/* STEP 1: LOGIN PHONE */}
            {step === 'login' && (
              <motion.form
                key="login-form"
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                onSubmit={handleSendCode}
                className="space-y-4 my-auto"
              >
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Inicia sesión</h3>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Teléfono (obligatorio)</label>
                    <input
                      type="text"
                      placeholder="Ingresa tu celular (ej. 76153585)"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3.5 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div className="p-3 bg-[#121212] rounded-xl border border-dashed border-[#2a2a2a]">
                    <span className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest block mb-1">Registro manual por primera vez</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Nombre completo"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-2.5 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500"
                      />
                      <input
                        type="email"
                        placeholder="Correo electrónico"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-2.5 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3.5 rounded-xl uppercase tracking-wider shadow-md transition-all cursor-pointer border border-blue-500/20"
                >
                  ENVIAR CODIGO
                </button>
              </motion.form>
            )}

            {/* STEP 2: VERIFY OTP */}
            {step === 'otp' && (
              <motion.form
                key="otp-form"
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                onSubmit={handleVerifyOTP}
                className="space-y-4 my-auto"
              >
                <div className="space-y-3">
                  <div className="p-3 bg-blue-950/20 text-blue-400 rounded-xl border border-blue-800/30 text-xs font-semibold flex items-center space-x-2">
                    <Check className="w-4 h-4 text-blue-400" />
                    <span>Código enviado a ******{phone.slice(-3)} por WhatsApp.</span>
                  </div>

                  <div className="p-3 bg-amber-950/20 text-amber-300 rounded-xl border border-amber-800/30 text-xs font-bold flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    <span>Modo dev OTP: {devOTP}</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Verifica OTP</label>
                    <input
                      type="text"
                      placeholder="Ingresa el código de 6 dígitos"
                      value={inputOTP}
                      onChange={(e) => setInputOTP(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3.5 text-xs font-semibold text-white outline-none focus:border-blue-500 text-center font-mono tracking-widest text-lg"
                      maxLength={6}
                      required
                    />
                    {otpError && <p className="text-[10px] text-rose-400 font-bold">Código OTP incorrecto. Revisa el código de prueba.</p>}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3.5 rounded-xl uppercase tracking-wider shadow-md transition-all cursor-pointer border border-blue-500/20"
                >
                  VERIFICAR TELEFONO
                </button>
              </motion.form>
            )}

            {/* STEP 3: LOGGED IN MAIN MENU */}
            {step === 'menu' && (
              <motion.div
                key="portal-menu"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-6 w-full"
              >
                <div className="text-center py-4">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest block">¡Acceso Correcto!</span>
                  <h3 className="text-lg font-bold text-white font-sans tracking-tight mt-1">¿Qué quieres hacer?</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Option Make Appointment */}
                  <div className="p-5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl flex flex-col justify-between hover:bg-[#222] transition-all">
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-white font-sans tracking-tight">Hacer cita</h4>
                      <p className="text-xs text-gray-400 font-medium leading-relaxed">Elegir servicio, profesional y horario disponible.</p>
                    </div>
                    <button
                      onClick={() => {
                        if (services.length > 0) setSelectedService(services[0]);
                        if (professionals.length > 0) setSelectedProf(professionals[0]);
                        setStep('new_appointment');
                      }}
                      className="mt-6 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold py-2.5 px-4 rounded-xl uppercase tracking-wider transition-all cursor-pointer border border-blue-500/20"
                    >
                      IR A HACER CITA
                    </button>
                  </div>

                  {/* Option Cancel Appointment */}
                  <div className="p-5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl flex flex-col justify-between hover:bg-[#222] transition-all">
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-white font-sans tracking-tight">Cancelar cita</h4>
                      <p className="text-xs text-gray-400 font-medium leading-relaxed">Ver tus citas activas y cancelar la que necesites.</p>
                    </div>
                    <button
                      onClick={() => setStep('cancel_appointment')}
                      className="mt-6 bg-[#121212] border border-[#2a2a2a] text-gray-300 hover:bg-[#1a1a1a] text-[10px] font-bold py-2.5 px-4 rounded-xl uppercase tracking-wider transition-all cursor-pointer"
                    >
                      IR A CANCELAR CITA
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 4: CREATE APPOINTMENT FORM */}
            {step === 'new_appointment' && (
              <motion.div
                key="new-appointment"
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                className="space-y-5 w-full"
              >
                <div className="flex justify-between items-center border-b border-[#2a2a2a] pb-3">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide">Nueva Cita</h3>
                  <button
                    onClick={() => setStep('menu')}
                    className="flex items-center space-x-1 text-xs font-semibold text-gray-400 hover:text-white cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>VOLVER</span>
                  </button>
                </div>

                {/* 1. Choose Service */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-white tracking-tight block">1) Elige un servicio</span>
                  <div className="flex flex-wrap gap-2">
                    {services.map((srv) => (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => setSelectedService(srv)}
                        className={`px-3 py-2 text-[10px] font-bold rounded-xl border text-center transition-all cursor-pointer ${
                          selectedService?.id === srv.id
                            ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                            : 'bg-[#1a1a1a] text-gray-300 border-[#2a2a2a] hover:bg-[#222]'
                        }`}
                      >
                        {srv.name} - {srv.duration} min
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Choose Prof & Date */}
                <div className="space-y-3">
                  <span className="text-xs font-bold text-white tracking-tight block">2) Selecciona profesional y fecha</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Especialista</label>
                      <select
                        value={selectedProf?.id || ''}
                        onChange={(e) => setSelectedProf(professionals.find(p => p.id === e.target.value) || null)}
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500"
                      >
                        {professionals.map(p => <option key={p.id} value={p.id} className="bg-[#141414]">{p.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Fecha</label>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-2.5 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Choose Hour slots */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-white tracking-tight block">3) Horarios disponibles</span>
                  {availableSlots.length > 0 ? (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-[140px] overflow-y-auto p-2 border border-[#2a2a2a] rounded-xl bg-[#121212]">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedTime(slot)}
                          className={`py-1.5 rounded-lg text-[10px] font-extrabold text-center border transition-all cursor-pointer ${
                            selectedTime === slot
                              ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                              : 'bg-[#1a1a1a] text-gray-300 border-[#2a2a2a] hover:bg-[#222]'
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 font-semibold py-4 text-center">No hay horarios disponibles para esta combinación.</p>
                  )}
                </div>

                {/* Confirm Trigger */}
                <button
                  onClick={handleConfirmAppointment}
                  disabled={!selectedTime}
                  className={`w-full font-bold text-xs py-3.5 rounded-xl uppercase tracking-wider shadow-md transition-all ${
                    selectedTime
                      ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer border border-blue-500/20'
                      : 'bg-[#1a1a1a] text-gray-600 border-[#2a2a2a]/60 cursor-not-allowed'
                  }`}
                >
                  CONFIRMAR CITA
                </button>
              </motion.div>
            )}

            {/* STEP 5: CANCEL ACTIVE APPOINTMENT */}
            {step === 'cancel_appointment' && (
              <motion.div
                key="cancel-appointment"
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                className="space-y-5 w-full"
              >
                <div className="flex justify-between items-center border-b border-[#2a2a2a] pb-3">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide">Tus Citas Activas</h3>
                  <button
                    onClick={() => setStep('menu')}
                    className="flex items-center space-x-1 text-xs font-semibold text-gray-400 hover:text-white cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>VOLVER</span>
                  </button>
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {userAppointments.map((app) => (
                    <div key={app.id} className="p-4 bg-[#1a1a1a]/60 border border-[#2a2a2a] rounded-2xl flex justify-between items-center transition-all">
                      <div>
                        <h4 className="text-xs font-bold text-white">{app.serviceName}</h4>
                        <p className="text-[10px] text-gray-400 font-bold mt-0.5">{app.date} a las {app.time}</p>
                        <p className="text-[10px] text-gray-500 font-medium">Especialista: {app.professionalName}</p>
                      </div>
                      <button
                        onClick={() => handleCancelClick(app.id)}
                        className="px-3 py-1.5 text-[10px] font-bold text-rose-400 hover:bg-rose-950/20 border border-rose-800/40 rounded-lg transition-all cursor-pointer"
                      >
                        Cancelar Reserva
                      </button>
                    </div>
                  ))}

                  {userAppointments.length === 0 && (
                    <div className="text-center py-12 text-gray-500 font-medium space-y-1">
                      <p>No tienes citas activas para cancelar.</p>
                      <p className="text-[10px]">Agenda un servicio desde el menú de opciones.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
