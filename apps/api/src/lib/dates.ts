import "./timezone.js";

/**
 * Convención de fechas
 * - Fechas de calendario (fecha de un ingreso, vigencia de un descuento,
 *   vencimiento de una cuota…): se guardan a medianoche UTC del día. Al leerlas
 *   se toma el día UTC más cercano, así también se interpretan bien los valores
 *   antiguos guardados a medianoche local.
 * - Instantes (momento de un cobro, auditoría): se agrupan por día y mes en la
 *   zona horaria de la escuela (ver timezone.ts).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_DAY_MS = DAY_MS / 2;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" → medianoche UTC de ese día. Otros formatos se interpretan tal cual. */
export function parseCalendarDate(value: string): Date {
  const m = DATE_ONLY.exec(value);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Date(value);
}

/** Día de calendario ("YYYY-MM-DD") de una fecha de calendario guardada. */
export function calendarDateOf(d: Date): string {
  return new Date(Math.round(d.getTime() / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

/** Medianoche UTC del día `day` del mes "YYYY-MM". */
export function calendarDateInMonth(yearMonth: string, day: number): Date {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, day));
}

/** Filtro Prisma "desde/hasta" (inclusivos) sobre una columna de fechas de calendario. */
export function calendarRangeFilter(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(parseCalendarDate(from).getTime() - HALF_DAY_MS);
  if (to) range.lte = new Date(parseCalendarDate(to).getTime() + HALF_DAY_MS - 1);
  return range;
}

/** Día de la escuela ("YYYY-MM-DD") en que ocurrió un instante. */
export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Mes de la escuela ("YYYY-MM") en que ocurrió un instante. */
export function yearMonthOf(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Primer y último instante del mes "YYYY-MM" en la zona de la escuela. */
export function monthDateRange(yearMonth: string): { start: Date; end: Date } {
  const [y, m] = yearMonth.split("-").map(Number);
  return {
    start: new Date(y!, m! - 1, 1),
    end: new Date(y!, m!, 0, 23, 59, 59, 999),
  };
}

/** Filtro Prisma "desde/hasta" (días de la escuela, inclusivos) sobre instantes. */
export function instantRangeFilter(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) {
    const [y, m, d] = from.split("-").map(Number);
    range.gte = new Date(y!, m! - 1, d!);
  }
  if (to) {
    const [y, m, d] = to.split("-").map(Number);
    range.lte = new Date(y!, m! - 1, d!, 23, 59, 59, 999);
  }
  return range;
}

/** Filtro Prisma por rango de meses "YYYY-MM" (inclusivo). */
export function yearMonthRangeFilter(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: { gte?: string; lte?: string } = {};
  if (from) range.gte = from;
  if (to) range.lte = to;
  return range;
}
