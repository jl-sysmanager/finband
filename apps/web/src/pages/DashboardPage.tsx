import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Layers, Receipt, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { BulkFeeGenerateDialog } from "@/components/fees/BulkFeeGenerateDialog";
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

type ActionItems = {
  yearMonth: string;
  studentsWithoutFee: { count: number; items: Array<{ studentId: string; studentName: string }> };
  unpaidFees: {
    count: number;
    totalPending: number;
    items: Array<{ id: string; studentName: string; pending: number }>;
  };
  pendingPayouts: { count: number; totalPending: number };
  studentsWithoutTeacher: { count: number };
  classesWithoutSchedule: { count: number };
};

export function DashboardPage() {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const ym = currentYearMonth();

  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api<Summary>("/dashboard/summary"),
  });
  const chart = useQuery({
    queryKey: ["dashboard-chart"],
    queryFn: () =>
      api<Array<{ month: string; income: number; expenses: number }>>("/dashboard/chart"),
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
          {isAdmin ? (
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
              <Layers className="h-4 w-4" /> Cuotas del mes
            </Button>
          ) : null}
        </div>
      }
    >
      {isAdmin ? (
        <>
          <BulkFeeGenerateDialog open={bulkOpen} onOpenChange={setBulkOpen} defaultMonth={ym} />
          <MonthCloseWizard open={closeOpen} onOpenChange={setCloseOpen} />
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        {loading ? (
          <Skeleton className="h-28 lg:col-span-12" />
        ) : (
          <>
            <HeroStat
              className="lg:col-span-4"
              label="Balance del mes"
              value={formatMoney(s?.monthlyBalance ?? 0)}
              sub={`${ym} · Centro activo`}
              tone="primary"
            />
            <HeroStat
              className="lg:col-span-2"
              label="Ingresos"
              value={formatMoney(s?.monthlyIncome ?? 0)}
              tone="income"
            />
            <HeroStat
              className="lg:col-span-2"
              label="Gastos"
              value={formatMoney(s?.monthlyExpenses ?? 0)}
              tone="expense"
            />
            <HeroStat
              className="lg:col-span-2"
              label="Cobros pend."
              value={formatMoney(s?.pendingCollections ?? 0)}
              tone="pending"
            />
            <HeroStat
              className="lg:col-span-2"
              label="Profesores pend."
              value={formatMoney(s?.pendingTeacherPay ?? 0)}
              tone="pending"
            />
          </>
        )}

        <Card className="lg:col-span-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolución 12 meses</CardTitle>
          </CardHeader>
          <CardContent className="h-56 sm:h-64">
            {chart.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart.data ?? []} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.35} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} width={48} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" name="Ingresos" fill="hsl(142 55% 40%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expenses" name="Gastos" fill="hsl(0 65% 50%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pendientes · {ym}</CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {actions.isLoading ? (
              <Skeleton className="h-24" />
            ) : (
              <>
                <PendingRow
                  label="Sin cuota"
                  value={a?.studentsWithoutFee.count ?? 0}
                  to="/pagos"
                  action={isAdmin ? () => setBulkOpen(true) : undefined}
                  actionLabel="Generar"
                />
                <PendingRow
                  label="Impagos"
                  value={a?.unpaidFees.count ?? 0}
                  hint={formatMoney(a?.unpaidFees.totalPending ?? 0)}
                  to="/pagos"
                />
                <PendingRow
                  label="Liquidaciones"
                  value={a?.pendingPayouts.count ?? 0}
                  hint={formatMoney(a?.pendingPayouts.totalPending ?? 0)}
                  to="/pagos"
                />
                <PendingRow
                  label="Sin profesor"
                  value={a?.studentsWithoutTeacher.count ?? 0}
                  to="/alumnos"
                />
                <PendingRow
                  label="Sin horario"
                  value={a?.classesWithoutSchedule.count ?? 0}
                  to="/clases"
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Centro</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Alumnos" value={s?.students ?? "—"} />
            <MiniStat label="Profesores" value={s?.teachers ?? "—"} />
            <MiniStat label="Clases" value={s?.classes ?? "—"} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Próximos vencimientos</CardTitle>
          </CardHeader>
          <CardContent className="max-h-40 space-y-2 overflow-y-auto">
            {due.isLoading ? (
              <Skeleton className="h-16" />
            ) : (due.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin vencimientos</p>
            ) : (
              due.data?.slice(0, 6).map((d) => (
                <div key={d.id} className="flex justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{d.studentName}</span>
                  <span className="shrink-0 text-expense">{formatMoney(d.pending)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 flex flex-col justify-center p-4">
          <p className="text-sm text-muted-foreground">Acceso rápido</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/alumnos">Alumnos</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/pagos">Pagos</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/informes">Informes</Link>
            </Button>
          </div>
        </Card>

        <CollapsibleSection
          className="lg:col-span-12"
          title="Últimos movimientos"
          description={`${(movements.data ?? []).length} registros · mostrar 6`}
        >
          <DataTable maxBodyHeight="220px">
            <DataTableHead>
              <DataTableTh>Fecha</DataTableTh>
              <DataTableTh>Concepto</DataTableTh>
              <DataTableTh>Categoría</DataTableTh>
              <DataTableTh className="text-right">Importe</DataTableTh>
            </DataTableHead>
            <tbody>
              {(movements.data ?? []).slice(0, 6).map((m, i) => (
                <DataTableRow key={i}>
                  <DataTableTd>{formatDate(m.date)}</DataTableTd>
                  <DataTableTd className="max-w-[200px] truncate">{m.concept}</DataTableTd>
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
              <Link to="/economia/ingresos">Ver todos los movimientos</Link>
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
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2 py-1.5">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {value}
          {hint ? ` · ${hint}` : ""}
        </p>
      </div>
      <div className="flex gap-1">
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
    <div className="rounded-lg bg-muted/30 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
