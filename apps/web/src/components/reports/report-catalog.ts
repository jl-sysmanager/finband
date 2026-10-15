import { downloadUrl } from "@/lib/api";
import { buildQuery } from "@/lib/utils";

export type ReportDef = {
  id: string;
  label: string;
  group?: string;
  pdf?: boolean;
  xlsx?: boolean;
  needsMonth?: boolean;
  needsYear?: boolean;
};

export const reports: ReportDef[] = [
  {
    id: "executive-monthly",
    label: "Cuadro de mando mensual",
    group: "Control diario (Fase A)",
    pdf: true,
    xlsx: true,
    needsMonth: true,
  },
  {
    id: "fees-issued-collected",
    label: "Cuotas emitidas vs cobradas",
    group: "Control diario (Fase A)",
    pdf: true,
    xlsx: true,
    needsMonth: true,
  },
  {
    id: "payouts-expected-paid",
    label: "Liquidaciones previsto vs pagado",
    group: "Control diario (Fase A)",
    pdf: true,
    xlsx: true,
    needsMonth: true,
  },
  {
    id: "debt-aging",
    label: "Antigüedad de deuda",
    group: "Control diario (Fase A)",
    pdf: true,
    xlsx: true,
  },
  {
    id: "students-without-fee",
    label: "Alumnos sin cuota del mes",
    group: "Control diario (Fase A)",
    pdf: true,
    xlsx: true,
    needsMonth: true,
  },
  { id: "balance-monthly", label: "Balance mensual", group: "Informes generales", pdf: true, xlsx: true, needsMonth: true },
  { id: "balance-annual", label: "Balance anual", group: "Informes generales", xlsx: true, needsYear: true },
  { id: "income-by-student", label: "Ingresos por alumno", group: "Informes generales", xlsx: true },
  { id: "cost-by-teacher", label: "Coste por profesor", group: "Informes generales", xlsx: true },
  { id: "unpaid", label: "Listado de impagos", group: "Informes generales", pdf: true, xlsx: true },
  { id: "evolution", label: "Evolución ingresos/gastos", group: "Informes generales", pdf: true },
];

export function previewPath(report: ReportDef, yearMonth: string, year: string) {
  const extra = report.needsMonth
    ? buildQuery({ yearMonth })
    : report.needsYear
      ? buildQuery({ year })
      : "";
  return `/reports/${report.id}${extra}`;
}

export function downloadHref(
  report: ReportDef,
  format: string,
  yearMonth: string,
  year: string,
  inlinePdf = false,
) {
  const params: Record<string, string | undefined> = { format };
  if (report.needsMonth) params.yearMonth = yearMonth;
  if (report.needsYear) params.year = year;
  if (format === "pdf" && inlinePdf) params.inline = "true";
  return downloadUrl(`/reports/${report.id}${buildQuery(params)}`);
}
