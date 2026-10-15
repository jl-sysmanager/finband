import { fromCents } from "./money.js";

/** Formatea céntimos como euros (1050 → «10,50 €»). */
export function formatMoneyEs(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(fromCents(cents));
}
