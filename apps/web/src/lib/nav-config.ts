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

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  adminOnly?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

const allGroups: NavGroup[] = [
  {
    label: "Resumen",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    label: "Centro educativo",
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
    items: [{ to: "/configuracion", label: "Configuración", icon: Settings, adminOnly: true }],
  },
];

export function navGroupsForUser(isAdmin: boolean): NavGroup[] {
  return allGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => isAdmin || !i.adminOnly),
    }))
    .filter((g) => g.items.length > 0);
}

/** @deprecated use navGroupsForUser */
export const navGroups = allGroups;

export const allNavItems = allGroups.flatMap((g) => g.items);
