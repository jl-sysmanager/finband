import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(n: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-ES");
}

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export type MonthOption = { value: string; label: string };

/** Meses completos (YYYY-MM) para listas desplegables, del más reciente al más antiguo. */
export function monthOptions(pastMonths = 48, futureMonths = 6): MonthOption[] {
  const now = new Date();
  const items: MonthOption[] = [];
  for (let offset = futureMonths; offset >= -pastMonths; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const raw = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    items.push({ value, label });
  }
  return items;
}

export function yearOptions(pastYears = 5, futureYears = 1): Array<{ value: string; label: string }> {
  const y = new Date().getFullYear();
  const items: Array<{ value: string; label: string }> = [];
  for (let year = y + futureYears; year >= y - pastYears; year--) {
    items.push({ value: String(year), label: String(year) });
  }
  return items;
}

export function ensureMonthInOptions(value: string, options: MonthOption[]): MonthOption[] {
  if (!value || options.some((o) => o.value === value)) return options;
  const [ys, ms] = value.split("-");
  const d = new Date(Number(ys), Number(ms) - 1, 1);
  if (Number.isNaN(d.getTime())) return options;
  const raw = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const label = raw.charAt(0).toUpperCase() + raw.slice(1);
  return [{ value, label }, ...options];
}

export function firstDayOfCurrentMonthISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isoDayOfWeekUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  const dow = dt.getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function mondayOfWeek(referenceIso: string): string {
  const dow = isoDayOfWeekUtc(referenceIso);
  return addDaysIso(referenceIso, -(dow - 1));
}

export function formatShortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function buildQuery(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
