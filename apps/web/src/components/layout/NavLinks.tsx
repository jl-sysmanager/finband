import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { NavGroup } from "@/lib/nav-config";

export function NavLinks({
  groups,
  onNavigate,
  variant = "sidebar",
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
  variant?: "sidebar" | "mobile";
}) {
  const isSidebar = variant === "sidebar";

  return (
    <div className={cn("space-y-6", isSidebar ? "p-3" : "space-y-4 p-1")}>
      {groups.map((group) => (
        <div key={group.label}>
          <p
            className={cn(
              "mb-2 px-3 text-xs font-semibold uppercase tracking-wider",
              isSidebar ? "text-sidebar-muted" : "text-muted-foreground",
            )}
          >
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    isSidebar
                      ? isActive
                        ? "border-l-2 border-sidebar-accent bg-white/10 font-medium text-sidebar-foreground"
                        : "border-l-2 border-transparent text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground"
                      : isActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
