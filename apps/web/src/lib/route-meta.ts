export type BreadcrumbItem = { label: string; to?: string };

type RouteMeta = { title: string; parent?: { label: string; to: string } };

const staticMeta: Record<string, RouteMeta> = {
  "/": { title: "Dashboard" },
  "/alumnos": { title: "Alumnos", parent: { label: "Centro educativo", to: "/alumnos" } },
  "/profesores": { title: "Profesores", parent: { label: "Centro educativo", to: "/profesores" } },
  "/clases": { title: "Clases", parent: { label: "Centro educativo", to: "/clases" } },
  "/tarifas": { title: "Tarifas", parent: { label: "Economía", to: "/tarifas" } },
  "/pagos": { title: "Pagos", parent: { label: "Economía", to: "/pagos" } },
  "/economia/ingresos": { title: "Ingresos", parent: { label: "Economía", to: "/economia/ingresos" } },
  "/economia/gastos": { title: "Gastos", parent: { label: "Economía", to: "/economia/gastos" } },
  "/informes": { title: "Informes", parent: { label: "Análisis", to: "/informes" } },
  "/configuracion": { title: "Configuración", parent: { label: "Sistema", to: "/configuracion" } },
};

export function matchRouteMeta(pathname: string): RouteMeta | null {
  if (staticMeta[pathname]) return staticMeta[pathname];

  if (pathname.startsWith("/alumnos/")) {
    return { title: "Ficha de alumno", parent: { label: "Alumnos", to: "/alumnos" } };
  }
  if (pathname.startsWith("/profesores/")) {
    return { title: "Ficha de profesor", parent: { label: "Profesores", to: "/profesores" } };
  }
  if (pathname.startsWith("/clases/")) {
    return { title: "Ficha de clase", parent: { label: "Clases", to: "/clases" } };
  }
  return null;
}

export function buildBreadcrumbs(
  pathname: string,
  dynamicTitle?: string | null,
): BreadcrumbItem[] {
  const meta = matchRouteMeta(pathname);
  if (!meta) return [{ label: "Inicio", to: "/" }];

  const items: BreadcrumbItem[] = [{ label: "Inicio", to: "/" }];
  if (meta.parent && meta.parent.to !== pathname) {
    items.push({ label: meta.parent.label, to: meta.parent.to });
  }
  items.push({ label: dynamicTitle?.trim() || meta.title });
  return items;
}

export function routeTitle(pathname: string, dynamicTitle?: string | null): string {
  const meta = matchRouteMeta(pathname);
  if (dynamicTitle?.trim()) return dynamicTitle.trim();
  return meta?.title ?? "Finband";
}

/** Rutas de ficha donde TopBar muestra título */
export function isDetailRoute(pathname: string): boolean {
  return (
    /^\/(alumnos|profesores|clases)\/[^/]+/.test(pathname) && !pathname.endsWith("/nuevo")
  );
}
