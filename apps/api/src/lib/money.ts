/**
 * Los importes se guardan en céntimos enteros y toda la lógica de la API trabaja
 * en céntimos. Solo se pasa a euros en el borde: respuestas HTTP (lib/money-api.ts),
 * informes, PDF y Excel. La entrada llega ya en céntimos desde los esquemas de
 * @finband/shared.
 */
export { centsToEuros as fromCents, eurosToCents as toCents } from "@finband/shared";

/**
 * Redondea a céntimo entero un resultado intermedio no entero (horas × tarifa,
 * porcentajes…), la mitad lejos de cero.
 */
export function roundCents(value: number): number {
  const abs = Number(Math.abs(value).toPrecision(12));
  return Math.sign(value) * Math.round(abs) || 0;
}

export function sumCents(amounts: Iterable<number>): number {
  let total = 0;
  for (const a of amounts) total += a;
  return total;
}

/** Porcentaje de un importe; el porcentaje viene en centésimas (12,5 % → 1250). */
export function percentOfCents(cents: number, percentHundredths: number): number {
  return roundCents((cents * percentHundredths) / 10_000);
}
