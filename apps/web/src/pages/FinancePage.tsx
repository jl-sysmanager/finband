import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@finband/shared";
import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterField } from "@/components/list/FilterField";
import { ListToolbar } from "@/components/list/ListToolbar";
import { PageHeader } from "@/components/list/PageHeader";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { ApiError, api } from "@/lib/api";
import { buildQuery, firstDayOfCurrentMonthISO, formatDate, formatMoney, todayISO } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

type FinanceProps = { mode: "incomes" | "expenses" };

type Entry = {
  id: string;
  date: string;
  concept: string;
  amount: number;
  method?: string | null;
  categoryId: string;
  notes?: string | null;
  category: { name: string };
};

export function FinancePage({ mode }: FinanceProps) {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const qc = useQueryClient();
  const isIncome = mode === "incomes";
  const [editing, setEditing] = useState<Entry | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(firstDayOfCurrentMonthISO());
  const [to, setTo] = useState(todayISO());

  const entries = useQuery({
    queryKey: [mode, from, to],
    queryFn: () =>
      api<Entry[]>(
        `/finance/${isIncome ? "incomes" : "expenses"}${buildQuery({ from: from || undefined, to: to || undefined })}`,
      ),
  });

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries.data ?? [];
    const s = search.toLowerCase();
    return (entries.data ?? []).filter(
      (e) =>
        e.concept.toLowerCase().includes(s) ||
        e.category.name.toLowerCase().includes(s) ||
        (e.notes?.toLowerCase().includes(s) ?? false),
    );
  }, [entries.data, search]);

  const categories = useQuery({
    queryKey: [isIncome ? "income-categories" : "expense-categories"],
    queryFn: () =>
      api<Array<{ id: string; name: string }>>(
        `/settings/${isIncome ? "income" : "expense"}-categories`,
      ),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown> & { id?: string }) =>
      body.id
        ? api(`/finance/${isIncome ? "incomes" : "expenses"}/${body.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : api(`/finance/${isIncome ? "incomes" : "expenses"}`, {
            method: "POST",
            body: JSON.stringify(body),
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [mode] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/finance/${isIncome ? "incomes" : "expenses"}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [mode] }),
  });

  function toDateInput(iso: string) {
    return iso.slice(0, 10);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const body: Record<string, unknown> = {
      id: editing?.id,
      date: fd.get("date"),
      concept: fd.get("concept"),
      categoryId: fd.get("categoryId"),
      amount: Number(fd.get("amount")),
      notes: fd.get("notes") || null,
    };
    if (isIncome) body.method = fd.get("method") || null;
    try {
      await save.mutateAsync(body);
      form.reset();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar el movimiento");
    }
  }

  const formKey = editing?.id ?? "new";
  const canShowEntryForm = categories.isSuccess;

  return (
    <div className="space-y-4">
      <PageHeader
        title={isIncome ? "Ingresos" : "Gastos"}
        description={`${filteredEntries.length} movimientos en el periodo`}
      />
      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>{editing ? "Editar movimiento" : `Registrar ${isIncome ? "ingreso" : "gasto"}`}</CardTitle>
          </CardHeader>
          <CardContent>
            {!canShowEntryForm ? (
              <p className="text-sm text-muted-foreground">Cargando categorías…</p>
            ) : (
              <form key={formKey} onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Fecha</Label>
                  <Input
                    name="date"
                    type="date"
                    required
                    defaultValue={editing ? toDateInput(editing.date) : undefined}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Concepto</Label>
                  <Input name="concept" required defaultValue={editing?.concept ?? ""} />
                </div>
                <div className="space-y-1">
                  <Label>Categoría</Label>
                  <select
                    name="categoryId"
                    required
                    defaultValue={editing?.categoryId ?? categories.data?.[0]?.id}
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
                  <Input
                    name="amount"
                    type="number"
                    step="0.01"
                    required
                    defaultValue={editing?.amount ?? ""}
                  />
                </div>
                {isIncome ? (
                  <div className="space-y-1">
                    <Label>Método de pago</Label>
                    <select
                      name="method"
                      defaultValue={editing?.method ?? ""}
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
                  <Input name="notes" defaultValue={editing?.notes ?? ""} />
                </div>
                {saveError ? (
                  <p className="md:col-span-3 text-sm text-destructive">{saveError}</p>
                ) : null}
                <div className="md:col-span-3 flex gap-2">
                  <Button type="submit" className="w-fit" disabled={save.isPending}>
                    {editing ? "Guardar" : "Registrar"}
                  </Button>
                  {editing ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditing(null);
                        setSaveError(null);
                      }}
                    >
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <ListToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar concepto o categoría…">
          <FilterField label="Desde">
            <Input type="date" className="h-10" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FilterField>
          <FilterField label="Hasta">
            <Input type="date" className="h-10" value={to} onChange={(e) => setTo(e.target.value)} />
          </FilterField>
        </ListToolbar>
        <CardContent className="pt-4">
          <DataTable>
            <DataTableHead>
              <DataTableTh>Fecha</DataTableTh>
              <DataTableTh>Concepto</DataTableTh>
              <DataTableTh>Categoría</DataTableTh>
              {isIncome ? <DataTableTh>Método</DataTableTh> : null}
              <DataTableTh className="text-right">Importe</DataTableTh>
              {isAdmin ? <DataTableTh className="w-24" /> : null}
            </DataTableHead>
            <tbody>
              {filteredEntries.map((e) => (
                <DataTableRow key={e.id}>
                  <DataTableTd>{formatDate(e.date)}</DataTableTd>
                  <DataTableTd>{e.concept}</DataTableTd>
                  <DataTableTd>{e.category.name}</DataTableTd>
                  {isIncome ? (
                    <DataTableTd>
                      {e.method
                        ? PAYMENT_METHOD_LABELS[e.method as keyof typeof PAYMENT_METHOD_LABELS]
                        : "—"}
                    </DataTableTd>
                  ) : null}
                  <DataTableTd
                    className={`text-right font-medium ${isIncome ? "text-income" : "text-expense"}`}
                  >
                    {formatMoney(e.amount)}
                  </DataTableTd>
                  {isAdmin ? (
                    <DataTableTd className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(e)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("¿Eliminar este movimiento?")) remove.mutate(e.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-expense" />
                      </Button>
                    </DataTableTd>
                  ) : null}
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        </CardContent>
      </Card>
    </div>
  );
}
