import { Music2 } from "lucide-react";
import { NavLinks } from "@/components/layout/NavLinks";
import { navGroupsForUser } from "@/lib/nav-config";
import { useAuth } from "@/stores/auth";

export function AppSidebar() {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === "ADMIN";
  const groups = navGroupsForUser(isAdmin);

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-accent text-primary-foreground">
          <Music2 className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">Finband</p>
          <p className="text-xs text-sidebar-muted">Escuela de Música</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto">
        <NavLinks groups={groups} variant="sidebar" />
      </nav>
      <div className="border-t border-white/10 px-5 py-3 text-xs text-sidebar-muted">
        {user?.username} · {isAdmin ? "Administrador" : "Solo lectura"}
      </div>
    </aside>
  );
}
