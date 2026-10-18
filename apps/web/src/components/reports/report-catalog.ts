import { downloadUrl } from "@/lib/api";
import { buildQuery } from "@/lib/utils";

export type MonthRange = { monthFrom: string; monthTo: string };

export type ReportDef = {
  id: "balance" | "students" | "teachers" | "debt";
  label: string;
  description: string;
  group: string;
  /** Se calcula sobre un rango de meses (desde/hasta). La deuda es siempre a fecha de hoy. */
  usesRange: boolean;
};

export const reports: ReportDef[] = [
  {
    id: "balance",
    label: "Balance del centro",
    description: "Ingresos, cobros de cuotas, gastos y pagos a profesores por mes",
    group: "Centro",
    usesRange: true,
  },
  {
    id: "students",
    label: "Alumnos",
    description: "Emitido, cobrado y pendiente por alumno; alumnos sin cuota",
    group: "Alumnos",
    usesRange: true,
  },
  {
    id: "debt",
    label: "Deuda pendiente",
    description: "Cuotas sin cobrar a fecha de hoy, por antigüedad",
    group: "Alumnos",
    usesRange: false,
  },
  {
    id: "teachers",
    label: "Profesores",
    description: "Liquidado, pagado y pendiente por profesor",
    group: "Profesores",
    usesRange: true,
  },
];

function params(report: ReportDef, range: MonthRange) {
  return report.usesRange ? { monthFrom: range.monthFrom, monthTo: range.monthTo } : {};
}

export function previewPath(report: ReportDef, range: MonthRange) {
  return `/reports/${report.id}${buildQuery(params(report, range))}`;
}

export function downloadHref(
  report: ReportDef,
  format: "pdf" | "xlsx",
  range: MonthRange,
  inlinePdf = false,
) {
  return downloadUrl(
    `/reports/${report.id}${buildQuery({
      ...params(report, range),
      format,
      inline: format === "pdf" && inlinePdf ? "true" : undefined,
    })}`,
  );
}
