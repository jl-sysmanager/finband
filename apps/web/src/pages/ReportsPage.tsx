import { useQuery } from "@tanstack/react-query";
import { Eye, FileDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FilterField } from "@/components/list/FilterField";
import { WorkspaceShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthSelect } from "@/components/form/MonthSelect";
import { YearSelect } from "@/components/form/YearSelect";
import { api } from "@/lib/api";
import { currentYearMonth } from "@/lib/utils";
import { PreviewTable } from "@/components/reports/ReportPreviewTable";
import { reports, previewPath, downloadHref } from "@/components/reports/report-catalog";
import { ReportCatalog } from "@/components/reports/ReportCatalog";

export function ReportsPage() {
  const [selectedId, setSelectedId] = useState(reports[0]!.id);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  type PdfPreview =
    | { status: "loading" }
    | { status: "ready"; url: string }
    | { status: "error" };
  // La vista previa PDF se pide a demanda y queda ligada a la URL pedida: al
  // cambiar de informe o periodo vuelve sola a "sin pedir" (generarla es caro).
  const [pdfRequest, setPdfRequest] = useState<{ url: string; attempt: number } | null>(null);
  const [pdfResult, setPdfResult] = useState<{ key: string; preview: PdfPreview } | null>(null);

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

  const activeRequest = pdfRequest && pdfRequest.url === pdfFetchUrl ? pdfRequest : null;
  const requestKey = activeRequest ? `${activeRequest.url}#${activeRequest.attempt}` : null;
  const pdfPreview: PdfPreview | { status: "idle" } = !requestKey
    ? { status: "idle" }
    : pdfResult?.key === requestKey
      ? pdfResult.preview
      : { status: "loading" };

  useEffect(() => {
    if (!activeRequest || !requestKey) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      let preview: PdfPreview;
      try {
        const res = await fetch(activeRequest.url, { credentials: "include" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        preview = { status: "ready", url: objectUrl };
      } catch {
        preview = { status: "error" };
      }
      if (!cancelled) setPdfResult({ key: requestKey, preview });
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeRequest, requestKey]);

  return (
    <WorkspaceShell
      title="Informes"
      description="Previsualiza los datos antes de exportar a PDF o Excel"
    >
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catálogo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-0 pb-4">
            <ReportCatalog selectedId={selectedId} onSelect={setSelectedId} />
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
                  {pdfPreview.status === "ready" ? (
                    <iframe
                      key={pdfPreview.url}
                      title={`PDF ${selected.label}`}
                      src={pdfPreview.url}
                      className="h-[480px] w-full rounded-lg border border-border bg-muted/20"
                    />
                  ) : pdfPreview.status === "loading" ? (
                    <p className="text-sm text-muted-foreground">Generando PDF…</p>
                  ) : pdfPreview.status === "error" ? (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-destructive">No se pudo generar el PDF.</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setPdfRequest((r) => (r ? { ...r, attempt: r.attempt + 1 } : r))
                        }
                      >
                        Reintentar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!pdfFetchUrl}
                      onClick={() => pdfFetchUrl && setPdfRequest({ url: pdfFetchUrl, attempt: 0 })}
                    >
                      Ver vista previa PDF
                    </Button>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </WorkspaceShell>
  );
}
