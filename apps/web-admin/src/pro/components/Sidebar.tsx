import { LayoutDashboard, Calendar, FolderOpen, FileSpreadsheet, Settings, Terminal, Globe, LogOut, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, onLogout }: SidebarProps) {
  const bookingUrl = 'http://localhost:5174';
  const menuItems = [
    { id: 'resumen', label: 'RESUMEN', icon: LayoutDashboard },
    { id: 'agenda', label: 'AGENDA', icon: Calendar },
    { id: 'catalogos', label: 'CATÁLOGOS', icon: FolderOpen },
    { id: 'reportes', label: 'REPORTES', icon: FileSpreadsheet },
    { id: 'ajustes', label: 'AJUSTES', icon: Settings },
    { id: 'portal', label: 'PORTAL CLIENTES', icon: Globe, external: true },
    { id: 'backend', label: 'GUÍA BACKEND', icon: Terminal },
  ];

  return (
    <div className="w-64 bg-[#121212] border-r border-[#2a2a2a] text-gray-200 flex flex-col h-screen fixed left-0 top-0 z-30 justify-between p-4 shadow-xl">
      <div>
        {/* Brand Logo */}
        <div className="flex items-center space-x-3 px-4 py-6 border-b border-[#2a2a2a]">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/30">
            <Calendar className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white font-sans flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-blue-500 rounded-full"></span>
              <span>Agenda Pro</span>
            </h1>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Demo Barber Studio</p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="mt-8 space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.external) {
                    window.open(bookingUrl, '_blank', 'noopener,noreferrer');
                    return;
                  }
                  setActiveTab(item.id);
                }}
                className={`relative w-full flex items-center space-x-3 px-4 py-3.5 rounded-xl font-sans text-xs font-semibold tracking-wider transition-all duration-200 outline-none ${
                  isActive
                    ? 'text-blue-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav"
                    className="absolute inset-0 bg-blue-500/10 rounded-xl -z-10 border border-blue-500/20"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-gray-400'}`} />
                <span>{item.label}</span>
                {item.external && <ExternalLink className="ml-auto h-3.5 w-3.5 text-gray-500" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Session Profile & LogOut */}
      <div className="border-t border-[#2a2a2a] pt-4 mt-auto">
        <div className="px-4 py-3 mb-3 bg-[#0e0e0e] rounded-xl border border-[#2a2a2a]">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Administrador</p>
          <p className="text-sm font-semibold text-gray-200 truncate">admin@demo.com</p>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl border border-[#2a2a2a] text-gray-400 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/5 active:bg-rose-500/10 text-xs font-bold tracking-wider transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span>CERRAR SESIÓN</span>
        </button>
      </div>
    </div>
  );
}
