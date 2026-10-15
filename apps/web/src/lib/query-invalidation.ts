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

/** Consultas que muestran clases, horarios o matrículas. */
export function invalidateClassQueries(qc: QueryClient, classId?: string) {
  void qc.invalidateQueries({ queryKey: ["classes"] });
  void qc.invalidateQueries({ queryKey: ["weekly-schedule"] });
  void qc.invalidateQueries({ queryKey: ["schedule-occurrences"] });
  void qc.invalidateQueries({ queryKey: ["dashboard-action-items"] });
  if (classId) void qc.invalidateQueries({ queryKey: ["class", classId] });
}

/** Consultas que muestran profesores (listados, selectores, clases y liquidaciones). */
export function invalidateTeacherQueries(qc: QueryClient, teacherId?: string) {
  void qc.invalidateQueries({ queryKey: ["teachers"] });
  void qc.invalidateQueries({ queryKey: ["classes"] });
  void qc.invalidateQueries({ queryKey: ["teacher-payouts"] });
  void qc.invalidateQueries({ queryKey: ["teacher-payout-preview"] });
  if (teacherId) void qc.invalidateQueries({ queryKey: ["teacher", teacherId] });
}
