import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadUrl } from "@/lib/api";
import { currentYearMonth } from "@/lib/utils";

const reports = [
  { id: "balance-monthly", label: "Balance mensual", pdf: true, xlsx: true },
  { id: "balance-annual", label: "Balance anual", xlsx: true },
  { id: "income-by-student", label: "Ingresos por alumno", xlsx: true },
  { id: "cost-by-teacher", label: "Coste por profesor", xlsx: true },
  { id: "unpaid", label: "Listado de impagos", pdf: true, xlsx: true },
  { id: "evolution", label: "Evolución ingresos/gastos", pdf: true },
];

export function ReportsPage() {
  const ym = currentYearMonth();
  const year = new Date().getFullYear();

  function href(id: string, format: string, extra = "") {
    const base = `/reports/${id}?format=${format}${extra}`;
    return downloadUrl(base);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Informes</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>{r.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {r.pdf ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={href(
                      r.id,
                      "pdf",
                      r.id === "balance-monthly" ? `&yearMonth=${ym}` : "",
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDF
                  </a>
                </Button>
              ) : null}
              {r.xlsx ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={href(
                      r.id,
                      "xlsx",
                      r.id === "balance-monthly"
                        ? `&yearMonth=${ym}`
                        : r.id === "balance-annual"
                          ? `&year=${year}`
                          : "",
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Excel
                  </a>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
