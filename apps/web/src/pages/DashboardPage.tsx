import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertCircle, GraduationCap, Music2, Receipt } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/stores/auth";
import { currentYearMonth } from "@/lib/utils";
import { MonthCloseWizard } from "@/components/dashboard/MonthCloseWizard";
import { WorkspaceShell } from "@/components/layout/PageShell";
import { CollapsibleSection } from "@/components/list/CollapsibleSection";
import { DataTable, DataTableHead, DataTableRow, DataTableTd, DataTableTh } from "@/components/list/DataTable";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { OperativeTile, FinanceChip, TotalBadge, DashboardListRow, EmptyList, MiniStat } from "@/components/dashboard/DashboardWidgets";

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
  studentsWithoutFee: { count: number };
  unpaidFees: {
    count: number;
    totalPending: number;
    items: Array<{ id: string; studentName: string; yearMonth: string; pending: number }>;
  };
  pendingPayouts: {
    count: number;
    totalPending: number;
    items: Array<{ id: string; teacherName: string; yearMonth: string; pending: number }>;
  };
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
  const a = actions.data;
  const failed = [summary, movements, due, actions].filter((q) => q.isError);
  const dueTotal = (due.data ?? []).reduce((acc, d) => acc + d.pending, 0);

  return (
    <WorkspaceShell
      title="Dashboard"
      description={`Operativa del centro · ${ym}`}
      actions={
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <Button size="sm" variant="accent" onClick={() => setCloseOpen(true)}>
              Cierre del mes
            </Button>
          ) : null}
          <Button variant="outline" size="sm" asChild>
            <Link to="/informes">
              <Receipt className="h-4 w-4" /> Informes
            </Link>
          </Button>
        </div>
      }
    >
      {isAdmin ? <MonthCloseWizard open={closeOpen} onOpenChange={setCloseOpen} /> : null}

      {failed.length > 0 ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              No se pudieron cargar algunos datos del panel: las cifras pueden estar incompletas.
            </span>
            <Button size="sm" variant="outline" onClick={() => failed.forEach((q) => void q.refetch())}>
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="lg:col-span-12">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Prioridades operativas</h2>
              <p className="text-sm text-muted-foreground">
                Colores: verde al día · ámbar revisar · rojo acción urgente
              </p>
            </div>
          </div>
          {actions.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : actions.isError ? (
            <p className="text-sm text-destructive">No se pudieron calcular las prioridades.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <OperativeTile
                icon={<AlertCircle className="h-5 w-5" />}
                label="Alumnos sin cuota"
                count={a?.studentsWithoutFee.count ?? 0}
                detail={ym}
                detailLabel="mes ref."
                to="/pagos"
                tone={(a?.studentsWithoutFee.count ?? 0) > 0 ? "warn" : "ok"}
              />
              <OperativeTile
                icon={<GraduationCap className="h-5 w-5" />}
                label="Alumnos sin profesor"
                count={a?.studentsWithoutTeacher.count ?? 0}
                to="/alumnos"
                tone={(a?.studentsWithoutTeacher.count ?? 0) > 0 ? "info" : "ok"}
              />
              <OperativeTile
                icon={<Music2 className="h-5 w-5" />}
                label="Clases sin horario"
                count={a?.classesWithoutSchedule.count ?? 0}
                to="/clases"
                tone={(a?.classesWithoutSchedule.count ?? 0) > 0 ? "info" : "ok"}
              />
            </div>
          )}
        </section>

        <div className="grid gap-3 lg:col-span-12 lg:grid-cols-3">
          <CollapsibleSection
            className="border-amber-500/30"
            title="Vencimientos"
            description={`Mes ${ym}`}
            defaultOpen={(due.data?.length ?? 0) > 0}
            headerRight={
              <TotalBadge
                count={due.data?.length ?? 0}
                amount={dueTotal}
                tone={(due.data?.length ?? 0) > 0 ? "warn" : "ok"}
              />
            }
          >
            {due.isLoading ? (
              <Skeleton className="h-24" />
            ) : (due.data ?? []).length === 0 ? (
              <EmptyList message="Sin vencimientos pendientes este mes." tone="ok" />
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                {due.data?.map((d) => (
                  <li key={d.id}>
                    <DashboardListRow
                      primary={d.studentName}
                      secondary={formatDate(d.dueDate)}
                      amount={d.pending}
                      amountTone="warn"
                      to="/pagos"
                    />
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            className="border-rose-500/30"
            title="Impagos"
            description="Cuotas con saldo pendiente"
            defaultOpen={(a?.unpaidFees.count ?? 0) > 0}
            headerRight={
              <TotalBadge
                count={a?.unpaidFees.count ?? 0}
                amount={a?.unpaidFees.totalPending ?? 0}
                tone={(a?.unpaidFees.count ?? 0) > 0 ? "alert" : "ok"}
              />
            }
          >
            {actions.isLoading ? (
              <Skeleton className="h-24" />
            ) : !(a?.unpaidFees.items.length ?? 0) ? (
              <EmptyList message="No hay impagos registrados." tone="ok" />
            ) : (
              <>
                <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                  {a?.unpaidFees.items.map((f) => (
                    <li key={f.id}>
                      <DashboardListRow
                        primary={f.studentName}
                        secondary={f.yearMonth}
                        amount={f.pending}
                        amountTone="alert"
                        to="/pagos"
                      />
                    </li>
                  ))}
                </ul>
                {(a?.unpaidFees.count ?? 0) > (a?.unpaidFees.items.length ?? 0) ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Mostrando {a?.unpaidFees.items.length} de {a?.unpaidFees.count}.{" "}
                    <Link to="/pagos" className="font-medium text-primary hover:underline">
                      Ver todos
                    </Link>
                  </p>
                ) : null}
              </>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            className="border-sky-500/30"
            title="Liquidaciones pendientes"
            description={`Profesores · ${ym}`}
            defaultOpen={(a?.pendingPayouts.count ?? 0) > 0}
            headerRight={
              <TotalBadge
                count={a?.pendingPayouts.count ?? 0}
                amount={a?.pendingPayouts.totalPending ?? 0}
                tone={(a?.pendingPayouts.count ?? 0) > 0 ? "warn" : "ok"}
              />
            }
          >
            {actions.isLoading ? (
              <Skeleton className="h-24" />
            ) : !(a?.pendingPayouts.items.length ?? 0) ? (
              <EmptyList message="Liquidaciones del mes al día." tone="ok" />
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                {a?.pendingPayouts.items.map((p) => (
                  <li key={p.id}>
                    <DashboardListRow
                      primary={p.teacherName}
                      secondary={p.yearMonth}
                      amount={p.pending}
                      amountTone="info"
                      to="/pagos"
                    />
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
        </div>

        <Card className="lg:col-span-12">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Centro educativo</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <MiniStat label="Alumnos" value={s?.students ?? "—"} />
            <MiniStat label="Profesores" value={s?.teachers ?? "—"} />
            <MiniStat label="Clases" value={s?.classes ?? "—"} />
          </CardContent>
        </Card>

        <section className="lg:col-span-12">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Resumen financiero · {ym}
          </h2>
          {summary.isLoading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <FinanceChip
                label="Balance libro"
                value={formatMoney(s?.monthlyBalance ?? 0)}
                tone={(s?.monthlyBalance ?? 0) >= 0 ? "income" : "expense"}
              />
              <FinanceChip label="Ingresos" value={formatMoney(s?.monthlyIncome ?? 0)} tone="income" />
              <FinanceChip label="Gastos" value={formatMoney(s?.monthlyExpenses ?? 0)} tone="expense" />
              <FinanceChip
                label="Cuotas pend."
                value={formatMoney(s?.pendingCollections ?? 0)}
                tone={(s?.pendingCollections ?? 0) > 0 ? "pending" : "neutral"}
              />
              <FinanceChip
                label="Profes. pend."
                value={formatMoney(s?.pendingTeacherPay ?? 0)}
                tone={(s?.pendingTeacherPay ?? 0) > 0 ? "pending" : "neutral"}
              />
            </div>
          )}
        </section>

        <CollapsibleSection
          className="lg:col-span-12"
          title="Movimientos del libro"
          description={`${ym} · últimos registros manuales`}
          headerRight={
            summary.isLoading ? (
              <Skeleton className="h-6 w-40" />
            ) : (
              <div className="max-w-[11rem] text-right text-[10px] leading-tight">
                <p>
                  <span className="text-muted-foreground">Ingresos </span>
                  <span className="font-semibold text-income">{formatMoney(s?.monthlyIncome ?? 0)}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Gastos </span>
                  <span className="font-semibold text-expense">{formatMoney(s?.monthlyExpenses ?? 0)}</span>
                  <span className="text-muted-foreground"> · Balance </span>
                  <span
                    className={cn(
                      "font-semibold",
                      (s?.monthlyBalance ?? 0) >= 0 ? "text-income" : "text-expense",
                    )}
                  >
                    {formatMoney(s?.monthlyBalance ?? 0)}
                  </span>
                </p>
              </div>
            )
          }
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
