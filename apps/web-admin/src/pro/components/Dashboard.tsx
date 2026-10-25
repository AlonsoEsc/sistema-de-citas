import { useState, useMemo } from 'react';
import { Appointment, Professional, Service } from '../types';
import { motion } from 'motion/react';
import { CalendarRange, TrendingUp, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface DashboardProps {
  appointments: Appointment[];
  professionals: Professional[];
  services: Service[];
}

type PeriodFilter = 'today' | '7days' | 'month' | 'year';

function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function Dashboard({ appointments, professionals }: DashboardProps) {
  const [period, setPeriod] = useState<PeriodFilter>('7days');

  // Filter appointments based on period
  const filteredAppointments = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = localDateString(today);

    return appointments.filter((app) => {
      const appDate = new Date(`${app.date}T00:00:00`);
      const diffDays = Math.round(
        (today.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (period === 'today') {
        return app.date === todayStr;
      } else if (period === '7days') {
        return diffDays >= 0 && diffDays < 7;
      } else if (period === 'month') {
        return (
          appDate.getFullYear() === today.getFullYear() &&
          appDate.getMonth() === today.getMonth()
        );
      } else {
        return appDate.getFullYear() === today.getFullYear();
      }
    });
  }, [appointments, period]);

  // Calculations
  const metrics = useMemo(() => {
    const total = filteredAppointments.length;
    const completed = filteredAppointments.filter(a => a.status === 'completed').length;
    const cancelled = filteredAppointments.filter(a => a.status === 'cancelled').length;
    const noShow = filteredAppointments.filter(a => a.status === 'no_show').length;

    const totalIncome = filteredAppointments
      .filter(a => a.status === 'completed' || a.status === 'confirmed')
      .reduce((sum, a) => sum + a.price, 0);

    const cancellationRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

    return {
      total,
      completed,
      noShow,
      cancellationRate,
      totalIncome
    };
  }, [filteredAppointments]);

  // Performance by professional
  const professionalPerformance = useMemo(() => {
    return professionals.map((prof) => {
      const profApps = filteredAppointments.filter(a => a.professionalId === prof.id);
      const activeApps = profApps.filter(a => a.status === 'completed' || a.status === 'confirmed');
      const income = activeApps.reduce((sum, a) => sum + a.price, 0);
      const totalCount = profApps.length;

      return {
        ...prof,
        count: totalCount,
        income,
        completedCount: profApps.filter(a => a.status === 'completed').length,
        noShowCount: profApps.filter(a => a.status === 'no_show').length,
      };
    }).sort((a, b) => b.income - a.income);
  }, [professionals, filteredAppointments]);

  // Chart data: Daily Revenue Trend
  const chartDataDaily = useMemo(() => {
    const datesMap: { [key: string]: number } = {};
    // Populate last 7 days of dates
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = localDateString(d);
      datesMap[dateStr] = 0;
    }

    // Add appointment revenue
    filteredAppointments.forEach((app) => {
      if ((app.status === 'completed' || app.status === 'confirmed') && datesMap[app.date] !== undefined) {
        datesMap[app.date] += app.price;
      }
    });

    return Object.keys(datesMap).map((date) => {
      const [, month, day] = date.split('-');
      return {
        fecha: `${day}/${month}`,
        Ingresos: datesMap[date]
      };
    });
  }, [filteredAppointments]);

  // Chart data: Services share
  const chartDataServices = useMemo(() => {
    const serviceCounts: { [key: string]: { count: number; value: number } } = {};
    filteredAppointments.forEach((app) => {
      if (app.status === 'completed' || app.status === 'confirmed') {
        if (!serviceCounts[app.serviceName]) {
          serviceCounts[app.serviceName] = { count: 0, value: 0 };
        }
        serviceCounts[app.serviceName].count += 1;
        serviceCounts[app.serviceName].value += app.price;
      }
    });

    return Object.keys(serviceCounts).map((name) => ({
      name,
      value: serviceCounts[name].value,
      count: serviceCounts[name].count
    }));
  }, [filteredAppointments]);

  const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#121212]/50 backdrop-blur-md p-5 rounded-2xl border border-[#2a2a2a]">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-sans">Resumen Comercial</h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">Control de ingresos, citas y rendimiento operativo</p>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex bg-[#1a1a1a] p-1.5 rounded-xl border border-[#2a2a2a]">
          {(['today', '7days', 'month', 'year'] as PeriodFilter[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setPeriod(tab)}
              className={`px-4 py-2 text-xs font-semibold rounded-lg font-sans transition-all duration-200 outline-none uppercase tracking-wider ${
                period === tab
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'today' ? 'Hoy' : tab === '7days' ? '7 Días' : tab === 'month' ? 'Este Mes' : 'Año'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: 'Citas del periodo',
            value: metrics.total,
            icon: CalendarRange,
            colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
            subtitle: `${metrics.completed} completadas`
          },
          {
            title: 'Ingresos',
            value: `$${metrics.totalIncome.toFixed(2)}`,
            icon: TrendingUp,
            colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
            subtitle: 'Cobrado y agendado'
          },
          {
            title: 'No show',
            value: metrics.noShow,
            icon: AlertCircle,
            colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
            subtitle: 'Clientes ausentes'
          },
          {
            title: 'Tasa cancelación',
            value: `${metrics.cancellationRate}%`,
            icon: RefreshCw,
            colorClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
            subtitle: 'Sobre total agendado'
          }
        ].map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-[#141414] p-5 rounded-2xl border border-[#2a2a2a] shadow-sm flex items-center justify-between"
            >
              <div className="space-y-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{kpi.title}</span>
                <h3 className="text-2xl font-extrabold text-white tracking-tight font-sans">{kpi.value}</h3>
                <span className="text-[11px] text-gray-400 font-medium block">{kpi.subtitle}</span>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${kpi.colorClass}`}>
                <Icon className="w-6 h-6" />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Graph Section Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dynamic Line Area Chart for Revenues */}
        <div className="lg:col-span-2 bg-[#141414] p-5 rounded-2xl border border-[#2a2a2a] shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">Tendencia de Ingresos</h3>
              <p className="text-xs text-gray-400">Facturación diaria acumulada del periodo</p>
            </div>
            <TrendingUp className="text-blue-400 w-5 h-5" />
          </div>
          <div className="h-72 w-full">
            {chartDataDaily.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartDataDaily}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2a2a2a" />
                  <XAxis dataKey="fecha" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value) => [`$${value}`, 'Ingresos']} contentStyle={{ background: '#121212', borderRadius: '12px', border: '1px solid #2a2a2a', color: '#fff', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="Ingresos" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorIncome)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-xs">Sin datos para graficar</div>
            )}
          </div>
        </div>

        {/* Pie Chart of Services share */}
        <div className="bg-[#141414] p-5 rounded-2xl border border-[#2a2a2a] shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">Demanda de Servicios</h3>
            <p className="text-xs text-gray-400">Distribución de ingresos por servicio</p>
          </div>
          <div className="h-60 flex items-center justify-center relative">
            {chartDataServices.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartDataServices}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartDataServices.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`$${value}`, 'Ingresos']} contentStyle={{ background: '#121212', borderRadius: '12px', border: '1px solid #2a2a2a', color: '#fff', fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-gray-500 text-xs">Sin transacciones registradas</div>
            )}
            <div className="absolute flex flex-col items-center">
              <Sparkles className="w-5 h-5 text-blue-400 mb-0.5 animate-pulse" />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Activo</span>
            </div>
          </div>
          <div className="space-y-2 mt-2">
            {chartDataServices.map((entry, index) => (
              <div key={entry.name} className="flex justify-between items-center text-xs">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-gray-300 font-medium truncate max-w-[140px]">{entry.name}</span>
                </div>
                <div className="text-gray-200 font-semibold space-x-1.5">
                  <span>{entry.count} u.</span>
                  <span className="text-gray-600 font-normal">|</span>
                  <span>${entry.value.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Professional Performance */}
      <div className="bg-[#141414] p-5 rounded-2xl border border-[#2a2a2a] shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Rendimiento por Profesional</h3>
          <p className="text-xs text-gray-400">Estadísticas operativas e ingresos facturados por especialista</p>
        </div>

        <div className="divide-y divide-[#2a2a2a]">
          {professionalPerformance.map((prof, idx) => {
            const percentage = metrics.totalIncome > 0 ? Math.round((prof.income / metrics.totalIncome) * 100) : 0;
            return (
              <div key={prof.id} className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3 w-full sm:w-1/3">
                  <div className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center font-bold text-gray-200 uppercase" style={{ borderLeft: `4px solid ${prof.color || '#ccc'}` }}>
                    {prof.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{prof.name}</h4>
                    <p className="text-xs text-gray-400 font-medium">{prof.count} citas asignadas</p>
                  </div>
                </div>

                {/* Progress bar visual representing revenue share */}
                <div className="w-full sm:w-1/3 flex items-center space-x-3">
                  <div className="w-full bg-[#1a1a1a] h-2 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.8, delay: idx * 0.1 }}
                      className="h-full bg-blue-500 rounded-full"
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-400 min-w-[28px] text-right">{percentage}%</span>
                </div>

                <div className="flex items-center space-x-6 text-xs text-gray-400 sm:w-1/4 justify-end">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-gray-500 block uppercase">No Shows</span>
                    <span className="font-semibold text-amber-400">{prof.noShowCount}</span>
                  </div>
                  <div className="text-right border-l border-[#2a2a2a] pl-4">
                    <span className="text-[10px] font-bold text-gray-500 block uppercase">Ingresos</span>
                    <span className="font-bold text-white">${prof.income.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
