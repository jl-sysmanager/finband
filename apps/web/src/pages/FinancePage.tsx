import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@finband/shared";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { FormSelect } from "@/components/form/FormSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterField } from "@/components/list/FilterField";
import { ListToolbar } from "@/components/list/ListToolbar";
import { PageHeader } from "@/components/list/PageHeader";
import { RowActionsMenu } from "@/components/list/RowActionsMenu";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConfirm } from "@/hooks/useConfirm";

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

const NO_METHOD = "__none__";

export function FinancePage({ mode }: FinanceProps) {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const qc = useQueryClient();
  const isIncome = mode === "incomes";
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [method, setMethod] = useState(NO_METHOD);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
    mutationFn: (body: Record<string, unknown> & { id?: string }) => {
      const { id, ...data } = body;
      return id
        ? api(`/finance/${isIncome ? "incomes" : "expenses"}/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
          })
        : api(`/finance/${isIncome ? "incomes" : "expenses"}`, {
            method: "POST",
            body: JSON.stringify(data),
          });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [mode] });
      setFormOpen(false);
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/finance/${isIncome ? "incomes" : "expenses"}/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: [mode] });
      if (editing?.id === id) {
        setFormOpen(false);
        setEditing(null);
      }
      setDeleteError(null);
    },
  });

  function openForm(entry?: Entry) {
    setSaveError(null);
    setEditing(entry ?? null);
    setCategoryId(entry?.categoryId ?? categories.data?.[0]?.id ?? "");
    setMethod(entry?.method ?? NO_METHOD);
    setFormOpen(true);
  }

  async function deleteEntry(entry: Entry) {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Eliminar movimiento",
      description: `¿Eliminar «${entry.concept}»?`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(entry.id);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar el movimiento");
    }
  }

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
      categoryId,
      amount: Number(fd.get("amount")),
      notes: fd.get("notes") || null,
    };
    if (isIncome) body.method = method === NO_METHOD ? null : method;
    try {
      await save.mutateAsync(body);
      form.reset();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar el movimiento");
    }
  }

  const formKey = editing?.id ?? "new";
  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const methodOptions = [
    { value: NO_METHOD, label: "—" },
    ...PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] })),
  ];

  return (
    <div className="page-container space-y-4">
      {confirmDialog}
      <PageHeader
        title={isIncome ? "Ingresos" : "Gastos"}
        description={`${filteredEntries.length} movimientos en el periodo`}
        actions={
          isAdmin ? (
            <Button size="sm" onClick={() => openForm()} disabled={!categories.isSuccess}>
              <Plus className="h-4 w-4" /> Nuevo movimiento
            </Button>
          ) : null
        }
      />
      {deleteError ? (
        <Alert variant="destructive">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      ) : null}

      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar movimiento" : `Registrar ${isIncome ? "ingreso" : "gasto"}`}
            </DialogTitle>
          </DialogHeader>
          {!categories.isSuccess ? (
            <p className="text-sm text-muted-foreground">Cargando categorías…</p>
          ) : (
            <form key={formKey} onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Fecha</Label>
                <Input
                  name="date"
                  type="date"
                  required
                  defaultValue={editing ? toDateInput(editing.date) : todayISO()}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Concepto</Label>
                <Input name="concept" required defaultValue={editing?.concept ?? ""} />
              </div>
              <div className="space-y-1">
                <Label>Categoría</Label>
                <FormSelect
                  value={categoryId}
                  onValueChange={setCategoryId}
                  options={categoryOptions}
                />
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
                  <FormSelect value={method} onValueChange={setMethod} options={methodOptions} />
                </div>
              ) : null}
              <div className="space-y-1 md:col-span-2">
                <Label>Observaciones</Label>
                <Input name="notes" defaultValue={editing?.notes ?? ""} />
              </div>
              {saveError ? (
                <Alert variant="destructive" className="md:col-span-2">
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              ) : null}
              <DialogFooter className="md:col-span-2 pt-2">
                {editing ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void deleteEntry(editing)}
                  >
                    <Trash2 className="h-4 w-4" /> Eliminar
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" onClick={() => setFormOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={save.isPending}>
                  {editing ? "Guardar" : "Registrar"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden">
        <ListToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar concepto o categoría…">
          <FilterField label="Desde">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FilterField>
          <FilterField label="Hasta">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
              {isAdmin ? <DataTableTh className="w-14" /> : null}
            </DataTableHead>
            <tbody>
              {filteredEntries.map((e) => (
                <DataTableRow key={e.id} onClick={() => isAdmin && openForm(e)}>
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
                    <DataTableTd className="text-right" onClick={(ev) => ev.stopPropagation()}>
                      <RowActionsMenu
                        actions={[
                          { label: "Editar", onSelect: () => openForm(e) },
                          {
                            label: "Eliminar",
                            destructive: true,
                            onSelect: () => void deleteEntry(e),
                          },
                        ]}
                      />
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
