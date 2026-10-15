/**
 * Los importes se guardan como Float en SQLite. Toda aritmética y comparación de
 * dinero pasa por céntimos enteros para no arrastrar errores de coma flotante
 * (p. ej. 10,10 × 3 = 30,299999…).
 */

/** Céntimos enteros, redondeando la mitad lejos de cero (10,005 → 1001). */
export function toCents(amount: number): number {
  const scaled = Number((Math.abs(amount) * 100).toPrecision(12));
  return Math.sign(amount) * Math.round(scaled);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function roundMoney(amount: number): number {
  return fromCents(toCents(amount));
}

export function sumMoney(amounts: Iterable<number>): number {
  let cents = 0;
  for (const a of amounts) cents += toCents(a);
  return fromCents(cents);
}

/** Diferencia redondeada a céntimos (a − b). */
export function subtractMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}
