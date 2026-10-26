import {
  BarChart3,
  CalendarDays,
  Globe,
  LayoutDashboard,
  MessageCircle,
  Scissors,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type PermissionKey } from "@citas/shared/access";
import type { Terms } from "../state/tenant";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Permiso necesario para ver la seccion; sin valor, la ve todo el equipo. */
  permission?: PermissionKey;
};

/** Secciones del panel. Las etiquetas usan el vocabulario del rubro del negocio. */
export function navigationFor(terms: Terms): NavItem[] {
  return [
    { to: "/resumen", label: "Resumen", icon: LayoutDashboard },
    { to: "/agenda", label: "Agenda", icon: CalendarDays },
    {
      to: "/conversaciones",
      label: "Conversaciones",
      icon: MessageCircle,
      permission: PERMISSIONS.appointmentsManage,
    },
    { to: "/clientes", label: terms.customers, icon: Users },
    { to: "/catalogo", label: `${terms.services} y equipo`, icon: Scissors },
    {
      to: "/reportes",
      label: "Reportes",
      icon: BarChart3,
      permission: PERMISSIONS.reportsView,
    },
    { to: "/portal", label: "Portal de reservas", icon: Globe },
    { to: "/ajustes", label: "Ajustes", icon: Settings },
  ];
}
