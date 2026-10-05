import {
  BarChart3,
  BookOpen,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Moon,
  Music2,
  Receipt,
  Settings,
  Sun,
  Users,
  Wallet,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/stores/theme";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/alumnos", label: "Alumnos", icon: GraduationCap },
  { to: "/profesores", label: "Profesores", icon: Users },
  { to: "/clases", label: "Clases", icon: BookOpen },
  { to: "/tarifas", label: "Tarifas", icon: Receipt },
  { to: "/economia/ingresos", label: "Ingresos", icon: Wallet },
  { to: "/economia/gastos", label: "Gastos", icon: CreditCard },
  { to: "/pagos", label: "Pagos", icon: Music2 },
  { to: "/informes", label: "Informes", icon: BarChart3 },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle, apply } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Music2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Finband</p>
            <p className="text-xs text-muted-foreground">Escuela de Música</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          {user?.username} · {user?.role === "ADMIN" ? "Administrador" : "Consulta"}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border px-4 md:px-6">
          <div className="flex h-14 items-center justify-between">
          <p className="text-sm font-medium md:hidden">Finband</p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                toggle();
                apply();
              }}
              aria-label="Cambiar tema"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-2 md:hidden">
            {nav.slice(0, 6).map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "whitespace-nowrap rounded-md px-2 py-1 text-xs",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
