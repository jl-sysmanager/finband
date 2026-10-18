import type { ReactNode } from "react";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import type { ReportDef } from "@/components/reports/report-catalog";
import { cn, formatMoney } from "@/lib/utils";

type BalanceFigures = {
  income: number;
  feeCollections: number;
  expense: number;
  teacherPayments: number;
  balance: number;
  excludedManualIncome: number;
  excludedManualExpense: number;
};

type BalanceReport = {
  rows: Array<BalanceFigures & { month: string }>;
  totals: BalanceFigures;
  indicators: {
    feesIssued: number;
    feesCollected: number;
    feesPending: number;
    collectionRate: number;
    payoutsSettled: number;
    payoutsPaid: number;
    payoutsPending: number;
  };
};

type StudentsReport = {
  rows: Array<{ student: string; fees: number; issued: number; discount: number; collected: number; pending: number }>;
  totals: { students: number; issued: number; discount: number; collected: number; pending: number; collectionRate: number };
  withoutFee: Array<{ student: string; months: string[] }>;
  payments: unknown[];
};

type TeachersReport = {
  rows: Array<{
    teacher: string;
    workDays: number;
    base: number;
    transport: number;
    settled: number;
    paid: number;
    pending: number;
  }>;
  totals: { teachers: number; workDays: number; base: number; transport: number; settled: number; paid: number; pending: number; paymentRate: number };
  payments: unknown[];
};

type DebtReport = {
  asOf: string;
  totalPending: number;
  students: number;
  summary: Array<{ bucket: string; amount: number }>;
  details: Array<{ student: string; yearMonth: string; dueDate: string; daysOverdue: number; pending: number }>;
};

const pct = (n: number) => `${n.toLocaleString("es-ES")} %`;
const money = formatMoney;

function Stats({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const Num = ({ children, strong }: { children: ReactNode; strong?: boolean }) => (
  <DataTableTd className={cn("text-right tabular-nums", strong && "font-semibold")}>{children}</DataTableTd>
);

function BalancePreview({ data }: { data: BalanceReport }) {
  const t = data.totals;
  const ind = data.indicators;
  const balanceTone = (n: number) => (n >= 0 ? "text-income" : "text-expense");
  return (
    <div className="space-y-3">
      <Stats
        items={[
          [
            "Balance del periodo",
            <span key="balance" className={balanceTone(t.balance)}>
              {money(t.balance)}
            </span>,
          ],
          ["Cobrado / tasa de cobro", `${money(ind.feesCollected)} · ${pct(ind.collectionRate)}`],
          ["Pendiente de cobro", money(ind.feesPending)],
          ["Pendiente de pago a profesores", money(ind.payoutsPending)],
        ]}
      />
      <DataTable>
        <DataTableHead>
          <DataTableTh>Mes</DataTableTh>
          <DataTableTh className="whitespace-nowrap text-right">+ Ingresos</DataTableTh>
          <DataTableTh className="whitespace-nowrap text-right">+ Cobros cuotas</DataTableTh>
          <DataTableTh className="whitespace-nowrap text-right">− Gastos</DataTableTh>
          <DataTableTh className="whitespace-nowrap text-right">− Pagos prof.</DataTableTh>
          <DataTableTh className="whitespace-nowrap text-right">Balance</DataTableTh>
        </DataTableHead>
        <tbody>
          {[...data.rows, ...(data.rows.length > 1 ? [{ ...t, month: "Total" }] : [])].map((r) => {
            const total = r.month === "Total";
            return (
              <DataTableRow key={r.month} className={total ? "bg-muted/40" : undefined}>
                <DataTableTd className={cn("whitespace-nowrap", total && "font-semibold")}>{r.month}</DataTableTd>
                <Num strong={total}>{money(r.income)}</Num>
                <Num strong={total}>{money(r.feeCollections)}</Num>
                <Num strong={total}>{money(r.expense)}</Num>
                <Num strong={total}>{money(r.teacherPayments)}</Num>
                <DataTableTd className={cn("text-right font-semibold tabular-nums", balanceTone(r.balance))}>
                  {money(r.balance)}
                </DataTableTd>
              </DataTableRow>
            );
          })}
        </tbody>
      </DataTable>
      {t.excludedManualIncome || t.excludedManualExpense ? (
        <p className="text-xs text-muted-foreground">
          No incluido en el balance (apuntes manuales que duplicarían lo registrado en la app):{" "}
          {money(t.excludedManualIncome)} de cuotas y {money(t.excludedManualExpense)} de profesores.
        </p>
      ) : null}
    </div>
  );
}

function StudentsPreview({ data }: { data: StudentsReport }) {
  const t = data.totals;
  return (
    <div className="space-y-3">
      <Stats
        items={[
          ["Alumnos con cuota", String(t.students)],
          ["Emitido", money(t.issued)],
          ["Cobrado / tasa de cobro", `${money(t.collected)} · ${pct(t.collectionRate)}`],
          ["Pendiente", money(t.pending)],
        ]}
      />
      {data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay cuotas en este periodo.</p>
      ) : (
        <DataTable maxBodyHeight="min(50vh, 520px)">
          <DataTableHead>
            <DataTableTh>Alumno</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Cuotas</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Emitido</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Descuentos</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Cobrado</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Pendiente</DataTableTh>
          </DataTableHead>
          <tbody>
            {data.rows.map((r) => (
              <DataTableRow key={r.student}>
                <DataTableTd>{r.student}</DataTableTd>
                <Num>{r.fees}</Num>
                <Num>{money(r.issued)}</Num>
                <Num>{money(r.discount)}</Num>
                <Num>{money(r.collected)}</Num>
                <DataTableTd className={cn("text-right tabular-nums", r.pending > 0 && "text-expense")}>
                  {money(r.pending)}
                </DataTableTd>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      )}
      {data.withoutFee.length > 0 ? (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          <p className="mb-1 font-medium">Alumnos activos sin cuota ({data.withoutFee.length})</p>
          <ul className="space-y-0.5 text-muted-foreground">
            {data.withoutFee.map((s) => (
              <li key={s.student}>
                {s.student}: {s.months.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        El Excel incluye además el detalle por mes y cada cobro ({data.payments.length}).
      </p>
    </div>
  );
}

function TeachersPreview({ data }: { data: TeachersReport }) {
  const t = data.totals;
  return (
    <div className="space-y-3">
      <Stats
        items={[
          ["Profesores liquidados", String(t.teachers)],
          ["Liquidado", money(t.settled)],
          ["Pagado", `${money(t.paid)} · ${pct(t.paymentRate)}`],
          ["Pendiente de pago", money(t.pending)],
        ]}
      />
      {data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay liquidaciones en este periodo.</p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableTh>Profesor</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Jornadas</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Base</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Transporte</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Liquidado</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Pagado</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Pendiente</DataTableTh>
          </DataTableHead>
          <tbody>
            {data.rows.map((r) => (
              <DataTableRow key={r.teacher}>
                <DataTableTd>{r.teacher}</DataTableTd>
                <Num>{r.workDays}</Num>
                <Num>{money(r.base)}</Num>
                <Num>{money(r.transport)}</Num>
                <Num>{money(r.settled)}</Num>
                <Num>{money(r.paid)}</Num>
                <DataTableTd className={cn("text-right tabular-nums", r.pending > 0 && "text-expense")}>
                  {money(r.pending)}
                </DataTableTd>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      )}
      <p className="text-xs text-muted-foreground">
        El Excel incluye además el detalle por mes y cada pago ({data.payments.length}).
      </p>
    </div>
  );
}

function DebtPreview({ data }: { data: DebtReport }) {
  return (
    <div className="space-y-3">
      <Stats
        items={[
          ["A fecha", data.asOf],
          ["Total pendiente", money(data.totalPending)],
          ["Alumnos con deuda", String(data.students)],
          ["Cuotas pendientes", String(data.details.length)],
        ]}
      />
      <DataTable>
        <DataTableHead>
          <DataTableTh>Antigüedad</DataTableTh>
          <DataTableTh className="whitespace-nowrap text-right">Importe</DataTableTh>
        </DataTableHead>
        <tbody>
          {data.summary.map((r) => (
            <DataTableRow key={r.bucket}>
              <DataTableTd>{r.bucket}</DataTableTd>
              <Num>{money(r.amount)}</Num>
            </DataTableRow>
          ))}
        </tbody>
      </DataTable>
      {data.details.length > 0 ? (
        <DataTable maxBodyHeight="min(40vh, 400px)">
          <DataTableHead>
            <DataTableTh>Alumno</DataTableTh>
            <DataTableTh>Cuota</DataTableTh>
            <DataTableTh>Vence</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Días</DataTableTh>
            <DataTableTh className="whitespace-nowrap text-right">Pendiente</DataTableTh>
          </DataTableHead>
          <tbody>
            {data.details.map((r) => (
              <DataTableRow key={`${r.student}-${r.yearMonth}`}>
                <DataTableTd>{r.student}</DataTableTd>
                <DataTableTd>{r.yearMonth}</DataTableTd>
                <DataTableTd>{r.dueDate}</DataTableTd>
                <Num>{r.daysOverdue}</Num>
                <Num>{money(r.pending)}</Num>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      ) : null}
    </div>
  );
}

export function PreviewTable({ reportId, data }: { reportId: ReportDef["id"]; data: unknown }) {
  if (!data || typeof data !== "object") return null;
  switch (reportId) {
    case "balance":
      return <BalancePreview data={data as BalanceReport} />;
    case "students":
      return <StudentsPreview data={data as StudentsReport} />;
    case "teachers":
      return <TeachersPreview data={data as TeachersReport} />;
    case "debt":
      return <DebtPreview data={data as DebtReport} />;
  }
}
