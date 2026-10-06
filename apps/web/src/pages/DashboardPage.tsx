import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { GraduationCap, Receipt, Wallet } from "lucide-react";
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
import { PageHeader } from "@/components/list/PageHeader";
import { StatCard } from "@/components/layout/StatCard";
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

export function DashboardPage() {
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

  const s = summary.data;
  const loading = summary.isLoading;

  return (
    <div className="page-container">
      <PageHeader
        title="Dashboard"
        description="Resumen del centro educativo"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/pagos">
                <Wallet className="h-4 w-4" /> Registrar cobro
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/informes">
                <Receipt className="h-4 w-4" /> Impagos
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/tarifas">
                <GraduationCap className="h-4 w-4" /> Cuotas
              </Link>
            </Button>
          </div>
        }
      />

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Centro</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {loading ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          ) : (
            <>
              <StatCard label="Alumnos" value={s?.students ?? "—"} />
              <StatCard label="Profesores" value={s?.teachers ?? "—"} />
              <StatCard label="Clases activas" value={s?.classes ?? "—"} />
            </>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Finanzas del mes</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <StatCard label="Ingresos" value={formatMoney(s?.monthlyIncome ?? 0)} tone="income" />
              <StatCard label="Gastos" value={formatMoney(s?.monthlyExpenses ?? 0)} tone="expense" />
              <StatCard label="Balance" value={formatMoney(s?.monthlyBalance ?? 0)} />
              <StatCard label="Cobros pendientes" value={formatMoney(s?.pendingCollections ?? 0)} />
              <StatCard label="Pagos profesores pend." value={formatMoney(s?.pendingTeacherPay ?? 0)} />
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Ingresos y gastos (12 meses)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {chart.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.4} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend />
                  <Bar dataKey="income" name="Ingresos" fill="hsl(142 71% 45%)" radius={4} />
                  <Bar dataKey="expenses" name="Gastos" fill="hsl(0 72% 51%)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos vencimientos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {due.isLoading ? (
              <Skeleton className="h-20" />
            ) : (due.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin vencimientos pendientes</p>
            ) : (
              due.data?.map((d) => (
                <div key={d.id} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium">{d.studentName}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(d.dueDate)}</p>
                  </div>
                  <p className="font-medium text-expense">{formatMoney(d.pending)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos movimientos económicos</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable>
            <DataTableHead>
              <DataTableTh>Fecha</DataTableTh>
              <DataTableTh>Concepto</DataTableTh>
              <DataTableTh>Categoría</DataTableTh>
              <DataTableTh className="text-right">Importe</DataTableTh>
            </DataTableHead>
            <tbody>
              {(movements.data ?? []).map((m, i) => (
                <DataTableRow key={i}>
                  <DataTableTd>{formatDate(m.date)}</DataTableTd>
                  <DataTableTd>{m.concept}</DataTableTd>
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
        </CardContent>
      </Card>
    </div>
  );
}
