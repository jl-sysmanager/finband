import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  Receipt,
  Settings,
  Users,
  Wallet,
  CircleDollarSign,
} from "lucide-react";

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    label: "Resumen",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    label: "Personas",
    items: [
      { to: "/alumnos", label: "Alumnos", icon: GraduationCap },
      { to: "/profesores", label: "Profesores", icon: Users },
      { to: "/clases", label: "Clases", icon: BookOpen },
    ],
  },
  {
    label: "Economía",
    items: [
      { to: "/tarifas", label: "Tarifas", icon: Receipt },
      { to: "/pagos", label: "Pagos", icon: CircleDollarSign },
      { to: "/economia/ingresos", label: "Ingresos", icon: Wallet },
      { to: "/economia/gastos", label: "Gastos", icon: CreditCard },
    ],
  },
  {
    label: "Análisis",
    items: [{ to: "/informes", label: "Informes", icon: BarChart3 }],
  },
  {
    label: "Sistema",
    items: [{ to: "/configuracion", label: "Configuración", icon: Settings }],
  },
];

export const allNavItems = navGroups.flatMap((g) => g.items);
