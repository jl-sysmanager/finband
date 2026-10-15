/**
 * La base de datos y la API trabajan en céntimos enteros; el contrato HTTP sigue
 * en euros (número con hasta dos decimales). Estas dos funciones son la frontera.
 */

/** Euros → céntimos enteros, redondeando la mitad lejos de cero (10,005 → 1001). */
export function eurosToCents(euros: number): number {
  // toPrecision elimina el ruido binario (10,1 × 100 = 1009,9999…) antes de redondear.
  const scaled = Number((Math.abs(euros) * 100).toPrecision(12));
  return Math.sign(euros) * Math.round(scaled) || 0;
}

export function centsToEuros(cents: number): number {
  return cents / 100;
}
