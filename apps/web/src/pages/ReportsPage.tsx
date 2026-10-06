import { useQuery } from "@tanstack/react-query";
import { Eye, FileDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FilterField } from "@/components/list/FilterField";
import { PageHeader } from "@/components/list/PageHeader";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthSelect } from "@/components/form/MonthSelect";
import { YearSelect } from "@/components/form/YearSelect";
import { api, downloadUrl } from "@/lib/api";
import { buildQuery, currentYearMonth, formatMoney } from "@/lib/utils";

type ReportDef = {
  id: string;
  label: string;
  pdf?: boolean;
  xlsx?: boolean;
  needsMonth?: boolean;
  needsYear?: boolean;
};

const reports: ReportDef[] = [
  { id: "balance-monthly", label: "Balance mensual", pdf: true, xlsx: true, needsMonth: true },
  { id: "balance-annual", label: "Balance anual", xlsx: true, needsYear: true },
  { id: "income-by-student", label: "Ingresos por alumno", xlsx: true },
  { id: "cost-by-teacher", label: "Coste por profesor", xlsx: true },
  { id: "unpaid", label: "Listado de impagos", pdf: true, xlsx: true },
  { id: "evolution", label: "Evolución ingresos/gastos", pdf: true },
];

function previewPath(report: ReportDef, yearMonth: string, year: string) {
  const extra = report.needsMonth
    ? buildQuery({ yearMonth })
    : report.needsYear
      ? buildQuery({ year })
      : "";
  return `/reports/${report.id}${extra}`;
}

function downloadHref(
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

function PreviewTable({ reportId, data }: { reportId: string; data: unknown }) {
  if (reportId === "balance-monthly" && data && typeof data === "object") {
    const d = data as {
      yearMonth: string;
      income: number;
      expense: number;
      feeCollections: number;
      balance: number;
    };
    return (
      <DataTable>
        <DataTableHead>
          <DataTableTh>Concepto</DataTableTh>
          <DataTableTh className="text-right">Importe</DataTableTh>
        </DataTableHead>
        <tbody>
          {[
            ["Ingresos", d.income],
            ["Gastos", d.expense],
            ["Cobros cuotas", d.feeCollections],
            ["Balance", d.balance],
          ].map(([label, amount]) => (
            <DataTableRow key={String(label)}>
              <DataTableTd>{label}</DataTableTd>
              <DataTableTd className="text-right font-medium">{formatMoney(Number(amount))}</DataTableTd>
            </DataTableRow>
          ))}
        </tbody>
      </DataTable>
    );
  }

  if (reportId === "balance-annual" && data && typeof data === "object") {
    const d = data as {
      rows: Array<{ month: string; income: number; expense: number; balance: number }>;
      totals: { income: number; expense: number; balance: number };
    };
    return (
      <DataTable>
        <DataTableHead>
          <DataTableTh>Mes</DataTableTh>
          <DataTableTh className="text-right">Ingresos</DataTableTh>
          <DataTableTh className="text-right">Gastos</DataTableTh>
          <DataTableTh className="text-right">Balance</DataTableTh>
        </DataTableHead>
        <tbody>
          {d.rows.map((r) => (
            <DataTableRow key={r.month}>
              <DataTableTd>{r.month}</DataTableTd>
              <DataTableTd className="text-right">{formatMoney(r.income)}</DataTableTd>
              <DataTableTd className="text-right">{formatMoney(r.expense)}</DataTableTd>
              <DataTableTd className="text-right">{formatMoney(r.balance)}</DataTableTd>
            </DataTableRow>
          ))}
          <DataTableRow>
            <DataTableTd className="font-medium">Total</DataTableTd>
            <DataTableTd className="text-right font-medium">{formatMoney(d.totals.income)}</DataTableTd>
            <DataTableTd className="text-right font-medium">{formatMoney(d.totals.expense)}</DataTableTd>
            <DataTableTd className="text-right font-medium">{formatMoney(d.totals.balance)}</DataTableTd>
          </DataTableRow>
        </tbody>
      </DataTable>
    );
  }

  if (
    (reportId === "income-by-student" || reportId === "cost-by-teacher") &&
    Array.isArray(data)
  ) {
    const label = reportId === "income-by-student" ? "Alumno" : "Profesor";
    return (
      <DataTable>
        <DataTableHead>
          <DataTableTh>{label}</DataTableTh>
          <DataTableTh className="text-right">Pagado</DataTableTh>
          <DataTableTh className="text-right">Pendiente</DataTableTh>
        </DataTableHead>
        <tbody>
          {(data as Array<{ name: string; paid: number; pending: number }>).map((r) => (
            <DataTableRow key={r.name}>
              <DataTableTd>{r.name}</DataTableTd>
              <DataTableTd className="text-right">{formatMoney(r.paid)}</DataTableTd>
              <DataTableTd className="text-right">{formatMoney(r.pending)}</DataTableTd>
            </DataTableRow>
          ))}
        </tbody>
      </DataTable>
    );
  }

  if (reportId === "unpaid" && Array.isArray(data)) {
    return (
      <DataTable>
        <DataTableHead>
          <DataTableTh>Alumno</DataTableTh>
          <DataTableTh>Mes</DataTableTh>
          <DataTableTh className="text-right">Pendiente</DataTableTh>
          <DataTableTh>Estado</DataTableTh>
        </DataTableHead>
        <tbody>
          {(data as Array<{ student: string; month: string; pending: number; status: string }>).map(
            (r, i) => (
              <DataTableRow key={`${r.student}-${r.month}-${i}`}>
                <DataTableTd>{r.student}</DataTableTd>
                <DataTableTd>{r.month}</DataTableTd>
                <DataTableTd className="text-right">{formatMoney(r.pending)}</DataTableTd>
                <DataTableTd>{r.status}</DataTableTd>
              </DataTableRow>
            ),
          )}
        </tbody>
      </DataTable>
    );
  }

  if (reportId === "evolution" && Array.isArray(data)) {
    return (
      <DataTable>
        <DataTableHead>
          <DataTableTh>Mes</DataTableTh>
          <DataTableTh className="text-right">Ingresos</DataTableTh>
          <DataTableTh className="text-right">Gastos</DataTableTh>
          <DataTableTh className="text-right">Balance</DataTableTh>
        </DataTableHead>
        <tbody>
          {(
            data as Array<{ month: string; income: number; expense: number; balance: number }>
          ).map((r) => (
            <DataTableRow key={r.month}>
              <DataTableTd>{r.month}</DataTableTd>
              <DataTableTd className="text-right">{formatMoney(r.income)}</DataTableTd>
              <DataTableTd className="text-right">{formatMoney(r.expense)}</DataTableTd>
              <DataTableTd className="text-right">{formatMoney(r.balance)}</DataTableTd>
            </DataTableRow>
          ))}
        </tbody>
      </DataTable>
    );
  }

  return <p className="text-sm text-muted-foreground">Sin datos para previsualizar.</p>;
}

export function ReportsPage() {
  const [selectedId, setSelectedId] = useState(reports[0]!.id);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? reports[0]!,
    [selectedId],
  );

  const preview = useQuery({
    queryKey: ["report-preview", selected.id, yearMonth, year],
    queryFn: () => api<unknown>(previewPath(selected, yearMonth, year)),
  });

  const pdfFetchUrl = selected.pdf
    ? downloadHref(selected, "pdf", yearMonth, year, true)
    : null;

  useEffect(() => {
    if (!pdfFetchUrl) {
      setPdfBlobUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await fetch(pdfFetchUrl, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setPdfBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setPdfBlobUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfFetchUrl]);

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="Informes"
        description="Previsualiza los datos antes de exportar a PDF o Excel"
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catálogo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-0 pb-4">
            {reports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                  selectedId === r.id ? "bg-primary/10 font-medium text-primary" : ""
                }`}
              >
                {r.label}
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{selected.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                {selected.needsMonth ? (
                  <FilterField label="Mes">
                    <MonthSelect className="max-w-xs" value={yearMonth} onChange={setYearMonth} />
                  </FilterField>
                ) : null}
                {selected.needsYear ? (
                  <FilterField label="Año">
                    <YearSelect className="max-w-[8rem]" value={year} onChange={setYear} />
                  </FilterField>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {selected.pdf ? (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={downloadHref(selected, "pdf", yearMonth, year)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileDown className="h-4 w-4" /> Descargar PDF
                      </a>
                    </Button>
                  ) : null}
                  {selected.xlsx ? (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={downloadHref(selected, "xlsx", yearMonth, year)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileDown className="h-4 w-4" /> Descargar Excel
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Eye className="h-4 w-4" /> Vista previa de datos
                </p>
                {preview.isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : preview.isError ? (
                  <p className="text-sm text-destructive">No se pudo cargar la previsualización.</p>
                ) : (
                  <PreviewTable reportId={selected.id} data={preview.data} />
                )}
              </div>

              {selected.pdf ? (
                <div>
                  <p className="mb-2 text-sm font-medium">Vista previa PDF</p>
                  {pdfBlobUrl ? (
                    <iframe
                      title={`PDF ${selected.label}`}
                      src={pdfBlobUrl}
                      className="h-[480px] w-full rounded-lg border border-border bg-muted/20"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Generando PDF…</p>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
