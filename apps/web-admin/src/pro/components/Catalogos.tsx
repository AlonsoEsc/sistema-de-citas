import React, { useState } from 'react';
import { Professional, Service, Client } from '../types';
import { Plus, Trash2, Search, User, Briefcase, Smile } from 'lucide-react';

interface CatalogosProps {
  professionals: Professional[];
  services: Service[];
  clients: Client[];
  onAddProfessional: (name: string) => void;
  onDeleteProfessional: (id: string) => void;
  onAddService: (service: Omit<Service, 'id'>) => void;
  onDeleteService: (id: string) => void;
  onAddClient: (client: Omit<Client, 'id'>) => void;
  onDeleteClient: (id: string) => void;
}

export default function Catalogos({
  professionals,
  services,
  clients,
  onAddProfessional,
  onDeleteProfessional,
  onAddService,
  onDeleteService,
  onAddClient,
  onDeleteClient
}: CatalogosProps) {
  // Professionals form state
  const [profName, setProfName] = useState('');

  // Services form state
  const [srvName, setSrvName] = useState('');
  const [srvDuration, setSrvDuration] = useState('45');
  const [srvPrice, setSrvPrice] = useState('250.00'); // Dollars for ease

  // Clients form state
  const [cliName, setCliName] = useState('');
  const [cliPhone, setCliPhone] = useState('');
  const [cliEmail, setCliEmail] = useState('');

  // Search filter for clients
  const [searchClient, setSearchClient] = useState('');

  const submitProfessional = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profName.trim()) return;
    onAddProfessional(profName.trim());
    setProfName('');
  };

  const submitService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!srvName.trim()) return;
    const duration = parseInt(srvDuration) || 30;
    const price = parseFloat(srvPrice) || 0;
    onAddService({ name: srvName.trim(), duration, price });
    setSrvName('');
    setSrvDuration('45');
    setSrvPrice('250.00');
  };

  const submitClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliName.trim() || !cliPhone.trim()) return;
    onAddClient({
      name: cliName.trim(),
      phone: cliPhone.trim(),
      email: cliEmail.trim() || `${cliName.trim().toLowerCase().replace(/\s+/g, '')}@example.com`
    });
    setCliName('');
    setCliPhone('');
    setCliEmail('');
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchClient.toLowerCase()) ||
    c.phone.includes(searchClient)
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#121212]/50 backdrop-blur-md p-5 rounded-2xl border border-[#2a2a2a]">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-sans">Catálogos</h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">Gestión de especialistas, portafolio de servicios y directorio de clientes</p>
        </div>
      </div>

      {/* Grid containing 3 sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* PROFESSIONALS COLUMN */}
        <div className="bg-[#141414] rounded-2xl border border-[#2a2a2a] p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-white">
            <User className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-bold uppercase tracking-wide">Profesionales</h3>
          </div>

          <form onSubmit={submitProfessional} className="flex gap-2">
            <input
              type="text"
              placeholder="Nombre completo"
              value={profName}
              onChange={(e) => setProfName(e.target.value)}
              className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-xs font-sans font-medium text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
              required
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all uppercase tracking-wider shadow-sm flex items-center space-x-1 cursor-pointer border border-blue-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>AGREGAR</span>
            </button>
          </form>

          <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
            {professionals.map((prof) => (
              <div key={prof.id} className="p-3 bg-[#1a1a1a]/55 hover:bg-[#1a1a1a] rounded-xl border border-[#2a2a2a]/60 flex items-center justify-between transition-all group">
                <div className="flex items-center space-x-2.5">
                  <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: prof.color || '#3b82f6' }} />
                  <span className="text-xs font-bold text-gray-200">{prof.name}</span>
                </div>
                <button
                  onClick={() => {
                    const confirmDel = window.confirm(`¿Seguro que deseas eliminar al profesional "${prof.name}"?`);
                    if (confirmDel) onDeleteProfessional(prof.id);
                  }}
                  className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-lg transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* SERVICES COLUMN */}
        <div className="bg-[#141414] rounded-2xl border border-[#2a2a2a] p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-white">
            <Briefcase className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold uppercase tracking-wide">Servicios</h3>
          </div>

          <form onSubmit={submitService} className="space-y-3 p-3 bg-[#121212] rounded-xl border border-[#2a2a2a]">
            <div>
              <label className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest block mb-1">Nombre del Servicio</label>
              <input
                type="text"
                placeholder="Ej. Corte clásico"
                value={srvName}
                onChange={(e) => setSrvName(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs font-sans font-medium text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest block mb-1">Duración (min)</label>
                <input
                  type="number"
                  placeholder="Minutos"
                  value={srvDuration}
                  onChange={(e) => setSrvDuration(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs font-sans font-medium text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
                  required
                />
              </div>
              <div>
                <label className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest block mb-1">Precio ($)</label>
                <input
                  type="text"
                  placeholder="Monto"
                  value={srvPrice}
                  onChange={(e) => setSrvPrice(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs font-sans font-medium text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all uppercase tracking-wider flex items-center justify-center space-x-1 cursor-pointer border border-blue-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>AGREGAR SERVICIO</span>
            </button>
          </form>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {services.map((srv) => (
              <div key={srv.id} className="p-3 bg-[#1a1a1a]/55 hover:bg-[#1a1a1a] rounded-xl border border-[#2a2a2a]/60 flex items-center justify-between transition-all">
                <div>
                  <h4 className="text-xs font-bold text-gray-200">{srv.name}</h4>
                  <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{srv.duration} min • ${srv.price.toFixed(2)}</p>
                </div>
                <button
                  onClick={() => {
                    const confirmDel = window.confirm(`¿Seguro que deseas eliminar el servicio "${srv.name}"?`);
                    if (confirmDel) onDeleteService(srv.id);
                  }}
                  className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-lg transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* CLIENTS COLUMN */}
        <div className="bg-[#141414] rounded-2xl border border-[#2a2a2a] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center space-x-2">
              <Smile className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold uppercase tracking-wide">Clientes</h3>
            </div>
            <div className="flex items-center bg-[#1a1a1a] border border-[#2a2a2a] px-2 py-1 rounded-lg">
              <Search className="w-3.5 h-3.5 text-gray-500 mr-1.5" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchClient}
                onChange={(e) => setSearchClient(e.target.value)}
                className="bg-transparent text-[11px] font-medium text-gray-200 placeholder-gray-500 outline-none max-w-[80px]"
              />
            </div>
          </div>

          <form onSubmit={submitClient} className="space-y-2.5 p-3 bg-[#121212] rounded-xl border border-[#2a2a2a]">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Nombre"
                value={cliName}
                onChange={(e) => setCliName(e.target.value)}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs font-sans font-medium text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
                required
              />
              <input
                type="text"
                placeholder="Teléfono"
                value={cliPhone}
                onChange={(e) => setCliPhone(e.target.value)}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs font-sans font-medium text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
                required
              />
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Correo (opcional)"
                value={cliEmail}
                onChange={(e) => setCliEmail(e.target.value)}
                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs font-sans font-medium text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
              />
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 rounded-xl transition-all uppercase tracking-wider shadow-sm flex items-center justify-center cursor-pointer border border-blue-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>

          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {filteredClients.map((cli) => (
              <div key={cli.id} className="p-3 bg-[#1a1a1a]/55 hover:bg-[#1a1a1a] rounded-xl border border-[#2a2a2a]/60 flex items-center justify-between transition-all">
                <div>
                  <h4 className="text-xs font-bold text-gray-200">{cli.name}</h4>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">{cli.phone}</p>
                  <p className="text-[9px] text-gray-500 font-semibold">{cli.email}</p>
                </div>
                <button
                  onClick={() => {
                    const confirmDel = window.confirm(`¿Seguro que deseas eliminar al cliente "${cli.name}"?`);
                    if (confirmDel) onDeleteClient(cli.id);
                  }}
                  className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-lg transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {filteredClients.length === 0 && (
              <p className="text-center text-xs text-gray-500 py-6">No se encontraron clientes</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
