import { NavLinks } from "@/components/layout/NavLinks";
import { SchoolLogo } from "@/components/layout/SchoolLogo";
import { useSchoolBranding } from "@/hooks/useSchoolBranding";
import { navGroupsForUser } from "@/lib/nav-config";
import { useAuth } from "@/stores/auth";

export function AppSidebar() {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === "ADMIN";
  const groups = navGroupsForUser(isAdmin);
  const branding = useSchoolBranding();
  const name = branding.data?.name ?? "Finband";
  const subtitle = branding.isLoading ? "…" : "Escuela de Música";

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="border-b border-white/10 px-5 py-4">
        <SchoolLogo
          name={name}
          hasLogo={branding.data?.hasLogo ?? false}
          updatedAt={branding.data?.updatedAt}
          size="md"
          subtitle={subtitle}
          className="[&_p]:text-sidebar-foreground [&_.text-muted-foreground]:text-sidebar-muted"
        />
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
