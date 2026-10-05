import { useQuery } from "@tanstack/react-query";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const kpis = [
    { label: "Alumnos", value: s?.students ?? "—" },
    { label: "Profesores", value: s?.teachers ?? "—" },
    { label: "Clases activas", value: s?.classes ?? "—" },
    { label: "Ingresos del mes", value: formatMoney(s?.monthlyIncome ?? 0), tone: "income" },
    { label: "Gastos del mes", value: formatMoney(s?.monthlyExpenses ?? 0), tone: "expense" },
    { label: "Balance mensual", value: formatMoney(s?.monthlyBalance ?? 0) },
    { label: "Cobros pendientes", value: formatMoney(s?.pendingCollections ?? 0) },
    { label: "Pagos profesores pend.", value: formatMoney(s?.pendingTeacherPay ?? 0) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumen del centro educativo</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={
                  k.tone === "income"
                    ? "text-2xl font-semibold text-income"
                    : k.tone === "expense"
                      ? "text-2xl font-semibold text-expense"
                      : "text-2xl font-semibold"
                }
              >
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Ingresos y gastos (12 meses)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend />
                <Bar dataKey="income" name="Ingresos" fill="hsl(142 71% 45%)" radius={4} />
                <Bar dataKey="expenses" name="Gastos" fill="hsl(0 72% 51%)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos vencimientos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(due.data ?? []).length === 0 ? (
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
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Fecha</th>
                <th className="pb-2 pr-4 font-medium">Concepto</th>
                <th className="pb-2 pr-4 font-medium">Categoría</th>
                <th className="pb-2 font-medium text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {(movements.data ?? []).map((m, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="py-2 pr-4">{formatDate(m.date)}</td>
                  <td className="py-2 pr-4">{m.concept}</td>
                  <td className="py-2 pr-4">{m.category}</td>
                  <td
                    className={`py-2 text-right font-medium ${m.type === "income" ? "text-income" : "text-expense"}`}
                  >
                    {m.type === "income" ? "+" : "-"}
                    {formatMoney(m.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
