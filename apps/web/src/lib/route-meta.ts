export type BreadcrumbItem = { label: string; to?: string };

type RouteMeta = { title: string; parent?: { label: string; to: string } };

const staticMeta: Record<string, RouteMeta> = {
  "/": { title: "Dashboard" },
  "/alumnos": { title: "Alumnos", parent: { label: "Personas", to: "/alumnos" } },
  "/profesores": { title: "Profesores", parent: { label: "Personas", to: "/profesores" } },
  "/clases": { title: "Clases", parent: { label: "Personas", to: "/clases" } },
  "/tarifas": { title: "Tarifas", parent: { label: "Economía", to: "/tarifas" } },
  "/pagos": { title: "Pagos", parent: { label: "Economía", to: "/pagos" } },
  "/economia/ingresos": { title: "Ingresos", parent: { label: "Economía", to: "/economia/ingresos" } },
  "/economia/gastos": { title: "Gastos", parent: { label: "Economía", to: "/economia/gastos" } },
  "/informes": { title: "Informes" },
  "/configuracion": { title: "Configuración" },
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
  if (!meta) return [];

  const items: BreadcrumbItem[] = [];
  if (meta.parent) items.push({ label: meta.parent.label, to: meta.parent.to });
  items.push({ label: dynamicTitle?.trim() || meta.title });
  return items;
}

export function routeTitle(pathname: string, dynamicTitle?: string | null): string {
  const meta = matchRouteMeta(pathname);
  if (dynamicTitle?.trim()) return dynamicTitle.trim();
  return meta?.title ?? "Finband";
}
