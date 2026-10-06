import { LogOut, Moon, Sun } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { MobileNav } from "@/components/layout/MobileNav";
import { Button } from "@/components/ui/button";
import { buildBreadcrumbs, routeTitle } from "@/lib/route-meta";
import { useAuth } from "@/stores/auth";
import { usePageTitle } from "@/stores/page-title";
import { useTheme } from "@/stores/theme";

export function TopBar() {
  const { pathname } = useLocation();
  const dynamicTitle = usePageTitle((s) => s.title);
  const { logout } = useAuth();
  const { theme, toggle, apply } = useTheme();
  const navigate = useNavigate();

  const title = routeTitle(pathname, dynamicTitle);
  const crumbs = buildBreadcrumbs(pathname, dynamicTitle);
  const isDetailRoute =
    /^\/(alumnos|profesores|clases)\/[^/]+/.test(pathname) && !pathname.endsWith("/nuevo");
  const showTopTitle = isDetailRoute || !!dynamicTitle;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <MobileNav />
        <div className="min-w-0 flex-1">
          {crumbs.length > 1 ? (
            <Breadcrumbs items={crumbs} className="hidden sm:flex" />
          ) : null}
          {showTopTitle ? (
            <h1 className="truncate text-base font-semibold md:text-lg">{title}</h1>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
            className="hidden sm:inline-flex"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            aria-label="Salir"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
