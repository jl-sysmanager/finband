import { DataTable, DataTableHead, DataTableRow, DataTableTd, DataTableTh } from "@/components/list/DataTable";
import { formatMoney } from "@/lib/utils";

export function PreviewTable({ reportId, data }: { reportId: string; data: unknown }) {
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

  if (reportId === "debt-aging" && data && typeof data === "object") {
    const d = data as {
      asOf: string;
      totalPending: number;
      summary: Array<{ bucket: string; amount: number }>;
      details: Array<{ student: string; yearMonth: string; pending: number; bucket: string }>;
    };
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Referencia {d.asOf} · Total pendiente {formatMoney(d.totalPending)}
        </p>
        <DataTable>
          <DataTableHead>
            <DataTableTh>Tramo</DataTableTh>
            <DataTableTh className="text-right">Importe</DataTableTh>
          </DataTableHead>
          <tbody>
            {d.summary.map((r) => (
              <DataTableRow key={r.bucket}>
                <DataTableTd>{r.bucket}</DataTableTd>
                <DataTableTd className="text-right">{formatMoney(r.amount)}</DataTableTd>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
        {d.details.length > 0 ? (
          <DataTable>
            <DataTableHead>
              <DataTableTh>Alumno</DataTableTh>
              <DataTableTh>Mes</DataTableTh>
              <DataTableTh>Tramo</DataTableTh>
              <DataTableTh className="text-right">Pendiente</DataTableTh>
            </DataTableHead>
            <tbody>
              {d.details.slice(0, 50).map((r, i) => (
                <DataTableRow key={`${r.student}-${r.yearMonth}-${i}`}>
                  <DataTableTd>{r.student}</DataTableTd>
                  <DataTableTd>{r.yearMonth}</DataTableTd>
                  <DataTableTd>{r.bucket}</DataTableTd>
                  <DataTableTd className="text-right">{formatMoney(r.pending)}</DataTableTd>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        ) : null}
      </div>
    );
  }

  if (reportId === "fees-issued-collected" && data && typeof data === "object") {
    const d = data as {
      yearMonth: string;
      totals: { issued: number; collected: number; pending: number; collectionRate: number };
      rows: Array<{ student: string; issued: number; collected: number; pending: number; status: string }>;
    };
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {d.yearMonth}: emitido {formatMoney(d.totals.issued)} · cobrado {formatMoney(d.totals.collected)} ·{" "}
          {d.totals.collectionRate}% cobro
        </p>
        <DataTable>
          <DataTableHead>
            <DataTableTh>Alumno</DataTableTh>
            <DataTableTh className="text-right">Emitido</DataTableTh>
            <DataTableTh className="text-right">Cobrado</DataTableTh>
            <DataTableTh className="text-right">Pendiente</DataTableTh>
            <DataTableTh>Estado</DataTableTh>
          </DataTableHead>
          <tbody>
            {d.rows.map((r) => (
              <DataTableRow key={`${r.student}-${r.status}`}>
                <DataTableTd>{r.student}</DataTableTd>
                <DataTableTd className="text-right">{formatMoney(r.issued)}</DataTableTd>
                <DataTableTd className="text-right">{formatMoney(r.collected)}</DataTableTd>
                <DataTableTd className="text-right">{formatMoney(r.pending)}</DataTableTd>
                <DataTableTd>{r.status}</DataTableTd>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      </div>
    );
  }

  if (reportId === "payouts-expected-paid" && data && typeof data === "object") {
    const d = data as {
      yearMonth: string;
      totals: { expected: number; paid: number; pending: number; paymentRate: number };
      rows: Array<{ teacher: string; expected: number; paid: number; pending: number; status: string }>;
    };
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {d.yearMonth}: previsto {formatMoney(d.totals.expected)} · pagado {formatMoney(d.totals.paid)} ·{" "}
          {d.totals.paymentRate}% pagado
        </p>
        <DataTable>
          <DataTableHead>
            <DataTableTh>Profesor</DataTableTh>
            <DataTableTh className="text-right">Previsto</DataTableTh>
            <DataTableTh className="text-right">Pagado</DataTableTh>
            <DataTableTh className="text-right">Pendiente</DataTableTh>
            <DataTableTh>Estado</DataTableTh>
          </DataTableHead>
          <tbody>
            {d.rows.map((r) => (
              <DataTableRow key={r.teacher}>
                <DataTableTd>{r.teacher}</DataTableTd>
                <DataTableTd className="text-right">{formatMoney(r.expected)}</DataTableTd>
                <DataTableTd className="text-right">{formatMoney(r.paid)}</DataTableTd>
                <DataTableTd className="text-right">{formatMoney(r.pending)}</DataTableTd>
                <DataTableTd>{r.status}</DataTableTd>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      </div>
    );
  }

  if (reportId === "executive-monthly" && data && typeof data === "object") {
    const d = data as {
      yearMonth: string;
      previousMonth: string;
      kpis: Array<{ label: string; value: number; unit: string; deltaPct?: number }>;
    };
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Mes {d.yearMonth} (comparación vs {d.previousMonth})
        </p>
        <DataTable>
          <DataTableHead>
            <DataTableTh>Indicador</DataTableTh>
            <DataTableTh className="text-right">Valor</DataTableTh>
            <DataTableTh className="text-right">Var. %</DataTableTh>
          </DataTableHead>
          <tbody>
            {d.kpis.map((k) => (
              <DataTableRow key={k.label}>
                <DataTableTd>{k.label}</DataTableTd>
                <DataTableTd className="text-right font-medium">
                  {k.unit === "money"
                    ? formatMoney(k.value)
                    : k.unit === "percent"
                      ? `${k.value}%`
                      : k.value}
                </DataTableTd>
                <DataTableTd className="text-right text-muted-foreground">
                  {k.deltaPct !== undefined ? `${k.deltaPct > 0 ? "+" : ""}${k.deltaPct}%` : "—"}
                </DataTableTd>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      </div>
    );
  }

  if (reportId === "students-without-fee" && data && typeof data === "object") {
    const d = data as {
      yearMonth: string;
      count: number;
      activeStudents: number;
      rows: Array<{ student: string; instrument: string; level: string; teacher: string }>;
    };
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {d.yearMonth}: {d.count} de {d.activeStudents} alumnos activos sin cuota generada
        </p>
        <DataTable>
          <DataTableHead>
            <DataTableTh>Alumno</DataTableTh>
            <DataTableTh>Instrumento</DataTableTh>
            <DataTableTh>Nivel</DataTableTh>
            <DataTableTh>Profesor</DataTableTh>
          </DataTableHead>
          <tbody>
            {d.rows.map((r) => (
              <DataTableRow key={r.student}>
                <DataTableTd>{r.student}</DataTableTd>
                <DataTableTd>{r.instrument}</DataTableTd>
                <DataTableTd>{r.level}</DataTableTd>
                <DataTableTd>{r.teacher}</DataTableTd>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      </div>
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
