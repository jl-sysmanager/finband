import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Receipt, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/stores/auth";
import { currentYearMonth } from "@/lib/utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MonthCloseWizard } from "@/components/dashboard/MonthCloseWizard";
import { WorkspaceShell } from "@/components/layout/PageShell";
import { HeroStat } from "@/components/layout/HeroStat";
import { CollapsibleSection } from "@/components/list/CollapsibleSection";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/utils";

type Summary = {
  students: number;
  teachers: number;
  classes: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyBalance: number;
  pendingCollections: number;
  pendingTeacherPay: number;
};

type ChartRow = {
  month: string;
  income: number;
  expenses: number;
  feesIssued: number;
  feesCollected: number;
  teacherPayoutsPaid: number;
};

type ActionItems = {
  yearMonth: string;
  studentsWithoutFee: { count: number };
  unpaidFees: { count: number; totalPending: number };
  pendingPayouts: { count: number; totalPending: number };
  studentsWithoutTeacher: { count: number };
  classesWithoutSchedule: { count: number };
};

export function DashboardPage() {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const [closeOpen, setCloseOpen] = useState(false);
  const ym = currentYearMonth();

  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api<Summary>("/dashboard/summary"),
  });
  const chart = useQuery({
    queryKey: ["dashboard-chart"],
    queryFn: () => api<ChartRow[]>("/dashboard/chart"),
  });
  const movements = useQuery({
    queryKey: ["dashboard-movements"],
    queryFn: () =>
      api<
        Array<{
          type: "income" | "expense";
          date: string;
          concept: string;
          category: string;
          amount: number;
        }>
      >("/dashboard/recent-movements"),
  });
  const due = useQuery({
    queryKey: ["dashboard-due"],
    queryFn: () =>
      api<
        Array<{
          id: string;
          studentName: string;
          dueDate: string | null;
          pending: number;
          status: string;
        }>
      >("/dashboard/upcoming-due"),
  });
  const actions = useQuery({
    queryKey: ["dashboard-action-items", ym],
    queryFn: () => api<ActionItems>(`/dashboard/action-items?yearMonth=${ym}`),
  });

  const s = summary.data;
  const loading = summary.isLoading;
  const a = actions.data;

  return (
    <WorkspaceShell
      title="Dashboard"
      description="Resumen del centro educativo"
      actions={
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <Button size="sm" variant="accent" onClick={() => setCloseOpen(true)}>
              Cierre del mes
            </Button>
          ) : null}
          <Button variant="outline" size="sm" asChild>
            <Link to="/pagos">
              <Wallet className="h-4 w-4" /> Registrar cobro
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/informes">
              <Receipt className="h-4 w-4" /> Informes
            </Link>
          </Button>
        </div>
      }
    >
      {isAdmin ? <MonthCloseWizard open={closeOpen} onOpenChange={setCloseOpen} /> : null}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Finanzas del mes — KPIs */}
        {loading ? (
          <Skeleton className="h-24 lg:col-span-12" />
        ) : (
          <>
            <HeroStat
              className="lg:col-span-3"
              label="Balance libro"
              value={formatMoney(s?.monthlyBalance ?? 0)}
              sub={`Ingresos − gastos · ${ym}`}
              tone="primary"
            />
            <HeroStat
              className="lg:col-span-2"
              label="Ingresos libro"
              value={formatMoney(s?.monthlyIncome ?? 0)}
              tone="income"
            />
            <HeroStat
              className="lg:col-span-2"
              label="Gastos libro"
              value={formatMoney(s?.monthlyExpenses ?? 0)}
              tone="expense"
            />
            <HeroStat
              className="lg:col-span-2"
              label="Cuotas pend."
              value={formatMoney(s?.pendingCollections ?? 0)}
              tone="pending"
            />
            <HeroStat
              className="lg:col-span-3"
              label="Profesores pend."
              value={formatMoney(s?.pendingTeacherPay ?? 0)}
              tone="pending"
            />
          </>
        )}

        {/* Evolución — bloque principal */}
        <Card className="lg:col-span-12">
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Evolución económica (12 meses)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Libro (ingresos/gastos), cuotas emitidas y cobradas, y pagos a profesores por mes
            </p>
          </CardHeader>
          <CardContent className="h-72 sm:h-80">
            {chart.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart.data ?? []} barGap={1} barCategoryGap="18%">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={52} />
                  <YAxis tick={{ fontSize: 10 }} width={52} tickFormatter={(v) => `${v}`} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="feesIssued" name="Cuotas emitidas" fill="hsl(172 45% 38%)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="feesCollected" name="Cobros alumnos" fill="hsl(172 45% 55%)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="teacherPayoutsPaid" name="Pagos profesores" fill="hsl(32 90% 50%)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="income" name="Ingresos libro" fill="hsl(142 55% 40%)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="expenses" name="Gastos libro" fill="hsl(0 65% 50%)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Operativa — alertas y vencimientos */}
        <Card className="lg:col-span-7">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tareas operativas · {ym}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {actions.isLoading ? (
              <Skeleton className="h-20 sm:col-span-2" />
            ) : (
              <>
                <PendingRow
                  label="Alumnos sin cuota"
                  value={a?.studentsWithoutFee.count ?? 0}
                  to="/pagos"
                />
                <PendingRow
                  label="Impagos"
                  value={a?.unpaidFees.count ?? 0}
                  hint={formatMoney(a?.unpaidFees.totalPending ?? 0)}
                  to="/pagos"
                />
                <PendingRow
                  label="Liquidaciones pendientes"
                  value={a?.pendingPayouts.count ?? 0}
                  hint={formatMoney(a?.pendingPayouts.totalPending ?? 0)}
                  to="/pagos"
                />
                <PendingRow
                  label="Alumnos sin profesor"
                  value={a?.studentsWithoutTeacher.count ?? 0}
                  to="/alumnos"
                />
                <PendingRow
                  label="Clases sin horario"
                  value={a?.classesWithoutSchedule.count ?? 0}
                  to="/clases"
                />
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Centro</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              <MiniStat label="Alumnos" value={s?.students ?? "—"} />
              <MiniStat label="Profesores" value={s?.teachers ?? "—"} />
              <MiniStat label="Clases" value={s?.classes ?? "—"} />
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Vencimientos · {ym}</CardTitle>
            </CardHeader>
            <CardContent className="max-h-36 space-y-2 overflow-y-auto">
              {due.isLoading ? (
                <Skeleton className="h-12" />
              ) : (due.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin vencimientos pendientes</p>
              ) : (
                due.data?.slice(0, 8).map((d) => (
                  <div key={d.id} className="flex justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{d.studentName}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(d.dueDate)}</p>
                    </div>
                    <span className="shrink-0 font-medium text-expense">{formatMoney(d.pending)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detalle libro — plegable */}
        <CollapsibleSection
          className="lg:col-span-12"
          title="Movimientos del libro (ingresos y gastos)"
          description="Últimos registros manuales"
        >
          <DataTable maxBodyHeight="200px">
            <DataTableHead>
              <DataTableTh>Fecha</DataTableTh>
              <DataTableTh>Concepto</DataTableTh>
              <DataTableTh>Categoría</DataTableTh>
              <DataTableTh className="text-right">Importe</DataTableTh>
            </DataTableHead>
            <tbody>
              {(movements.data ?? []).slice(0, 8).map((m, i) => (
                <DataTableRow key={i}>
                  <DataTableTd>{formatDate(m.date)}</DataTableTd>
                  <DataTableTd className="max-w-[220px] truncate">{m.concept}</DataTableTd>
                  <DataTableTd>{m.category}</DataTableTd>
                  <DataTableTd
                    className={`text-right font-medium ${m.type === "income" ? "text-income" : "text-expense"}`}
                  >
                    {m.type === "income" ? "+" : "-"}
                    {formatMoney(m.amount)}
                  </DataTableTd>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
          <div className="mt-2">
            <Button size="sm" variant="ghost" className="h-auto px-0" asChild>
              <Link to="/economia/ingresos">Ver libro completo</Link>
            </Button>
          </div>
        </CollapsibleSection>
      </div>
    </WorkspaceShell>
  );
}

function PendingRow({
  label,
  value,
  hint,
  to,
  action,
  actionLabel,
}: {
  label: string;
  value: number;
  hint?: string;
  to: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {value}
          {hint ? ` · ${hint}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {action && value > 0 ? (
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={action}>
            {actionLabel}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
          <Link to={to}>Ver</Link>
        </Button>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 py-2 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
