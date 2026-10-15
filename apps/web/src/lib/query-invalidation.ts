import type { QueryClient } from "@tanstack/react-query";

/** Prefijos de consultas que dependen de cuotas, cobros o liquidaciones. */
const FINANCE_PREFIXES = new Set([
  "student",
  "students",
  "student-fees",
  "student-fee-preview",
  "bulk-fee-preview",
  "teacher",
  "teacher-payouts",
  "teacher-payout-preview",
  "report-preview",
]);

/**
 * Tras un cambio en cuotas, cobros o liquidaciones refresca todo lo que lo
 * muestra: fichas, listados, dashboard e informes.
 */
export function invalidateFinanceQueries(qc: QueryClient) {
  return qc.invalidateQueries({
    predicate: (q) => {
      const head = q.queryKey[0];
      return (
        typeof head === "string" && (FINANCE_PREFIXES.has(head) || head.startsWith("dashboard-"))
      );
    },
  });
}
