import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@finband/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

type FinanceProps = { mode: "incomes" | "expenses" };

export function FinancePage({ mode }: FinanceProps) {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const qc = useQueryClient();
  const isIncome = mode === "incomes";

  const entries = useQuery({
    queryKey: [mode],
    queryFn: () =>
      api<
        Array<{
          id: string;
          date: string;
          concept: string;
          amount: number;
          method?: string;
          category: { name: string };
        }>
      >(`/finance/${isIncome ? "incomes" : "expenses"}`),
  });

  const categories = useQuery({
    queryKey: [isIncome ? "income-categories" : "expense-categories"],
    queryFn: () =>
      api<Array<{ id: string; name: string }>>(
        `/settings/${isIncome ? "income" : "expense"}-categories`,
      ),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/finance/${isIncome ? "incomes" : "expenses"}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [mode] }),
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      date: fd.get("date"),
      concept: fd.get("concept"),
      categoryId: fd.get("categoryId"),
      amount: Number(fd.get("amount")),
      notes: fd.get("notes") || null,
    };
    if (isIncome) body.method = fd.get("method") || null;
    await create.mutateAsync(body);
    e.currentTarget.reset();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{isIncome ? "Ingresos" : "Gastos"}</h1>
      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Registrar {isIncome ? "ingreso" : "gasto"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Fecha</Label>
                <Input name="date" type="date" required />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Concepto</Label>
                <Input name="concept" required />
              </div>
              <div className="space-y-1">
                <Label>Categoría</Label>
                <select
                  name="categoryId"
                  required
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                >
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Importe</Label>
                <Input name="amount" type="number" step="0.01" required />
              </div>
              {isIncome ? (
                <div className="space-y-1">
                  <Label>Método de pago</Label>
                  <select
                    name="method"
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                  >
                    <option value="">—</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="space-y-1 md:col-span-2">
                <Label>Observaciones</Label>
                <Input name="notes" />
              </div>
              <Button type="submit" className="md:col-span-3 w-fit">
                Guardar
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2">Fecha</th>
                <th className="pb-2">Concepto</th>
                <th className="pb-2">Categoría</th>
                {isIncome ? <th className="pb-2">Método</th> : null}
                <th className="pb-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {entries.data?.map((e) => (
                <tr key={e.id} className="border-b border-border/60">
                  <td className="py-2">{formatDate(e.date)}</td>
                  <td className="py-2">{e.concept}</td>
                  <td className="py-2">{e.category.name}</td>
                  {isIncome ? (
                    <td className="py-2">
                      {e.method
                        ? PAYMENT_METHOD_LABELS[e.method as keyof typeof PAYMENT_METHOD_LABELS]
                        : "—"}
                    </td>
                  ) : null}
                  <td
                    className={`py-2 text-right font-medium ${isIncome ? "text-income" : "text-expense"}`}
                  >
                    {formatMoney(e.amount)}
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
