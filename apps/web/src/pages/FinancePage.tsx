import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { TablePagination } from "@/components/list/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import { FormSelect } from "@/components/form/FormSelect";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/form/Field";
import { Input } from "@/components/ui/input";
import { EntityDetailSheet } from "@/components/layout/EntityDetailSheet";
import { SheetFooter } from "@/components/ui/sheet";
import { FilterField } from "@/components/list/FilterField";
import { ListToolbar } from "@/components/list/ListToolbar";
import { ListShell } from "@/components/layout/PageShell";
import { QueryState } from "@/components/layout/QueryState";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { ApiError, api } from "@/lib/api";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { buildQuery, firstDayOfCurrentMonthISO, formatDate, formatMoney, todayISO } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConfirm } from "@/hooks/useConfirm";
import { toast } from "@/stores/toast";

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [method, setMethod] = useState(NO_METHOD);
  const paymentMethods = usePaymentMethods();
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

  const pagination = usePagination(filteredEntries, 12, `${mode}|${from}|${to}|${search}`);

  const categories = useQuery({
    queryKey: [isIncome ? "income-categories" : "expense-categories"],
    queryFn: () =>
      api<Array<{ id: string; name: string; managedByApp: boolean }>>(
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
      setSheetOpen(false);
      setEditing(null);
      toast("Movimiento guardado", "success");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/finance/${isIncome ? "incomes" : "expenses"}/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: [mode] });
      if (editing?.id === id) {
        setSheetOpen(false);
        setEditing(null);
      }
      setDeleteError(null);
    },
  });

  function openForm(entry?: Entry) {
    setSaveError(null);
    setEditing(entry ?? null);
    setCategoryId(
      entry?.categoryId ?? categories.data?.find((c) => !c.managedByApp)?.id ?? "",
    );
    setMethod(entry?.method ?? NO_METHOD);
    setSheetOpen(true);
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
  // Las categorías gestionadas por la app (cobros de cuotas / pagos a profesores) no
  // admiten apuntes nuevos; solo se muestran al editar un apunte antiguo que ya la usa.
  const categoryOptions = (categories.data ?? [])
    .filter((c) => !c.managedByApp || c.id === editing?.categoryId)
    .map((c) => ({ value: c.id, label: c.managedByApp ? `${c.name} (gestionada por la app)` : c.name }));
  const managedNote = isIncome
    ? "Los cobros de cuotas se registran en Pagos y ya suman en el balance."
    : "Los pagos a profesores se registran en sus liquidaciones y ya restan en el balance.";
  const methodOptions = [
    { value: NO_METHOD, label: "—" },
    ...paymentMethods.options(editing?.method),
  ];

  return (
    <>
      {confirmDialog}
      {deleteError ? (
        <Alert variant="destructive" className="page-container">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      ) : null}

      <EntityDetailSheet
        open={sheetOpen}
        onOpenChange={(o) => {
          if (!o) {
            setSheetOpen(false);
            setEditing(null);
          }
        }}
        size="lg"
        title={editing ? editing.concept : `Nuevo ${isIncome ? "ingreso" : "gasto"}`}
        description={editing ? formatDate(editing.date) : "Registrar movimiento en el libro"}
        footer={
          isAdmin && categories.isSuccess ? (
            <SheetFooter className="w-full border-0 bg-transparent p-0">
              {editing ? (
                <Button type="button" variant="destructive" size="sm" onClick={() => void deleteEntry(editing)}>
                  <Trash2 className="h-4 w-4" /> Eliminar
                </Button>
              ) : null}
              <Button type="submit" form="finance-sheet-form" size="sm" disabled={save.isPending}>
                {editing ? "Guardar" : "Registrar"}
              </Button>
            </SheetFooter>
          ) : undefined
        }
      >
          {!categories.isSuccess ? (
            <p className="text-sm text-muted-foreground">Cargando categorías…</p>
          ) : (
            <form id="finance-sheet-form" key={formKey} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
              <Field label="Fecha">
                <Input
                  name="date"
                  type="date"
                  required
                  defaultValue={editing ? toDateInput(editing.date) : todayISO()}
                />
              </Field>
              <Field label="Concepto" className="md:col-span-2">
                <Input name="concept" required defaultValue={editing?.concept ?? ""} />
              </Field>
              <div className="space-y-1">
                <Field label="Categoría">
                  <FormSelect
                    value={categoryId}
                    onValueChange={setCategoryId}
                    options={categoryOptions}
                  />
                </Field>
                <p className="text-xs text-muted-foreground">{managedNote}</p>
              </div>
              <Field label="Importe">
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={editing?.amount ?? ""}
                />
              </Field>
              {isIncome ? (
                <Field label="Método de pago">
                  <FormSelect value={method} onValueChange={setMethod} options={methodOptions} />
                </Field>
              ) : null}
              <Field label="Observaciones" className="md:col-span-2">
                <Input name="notes" defaultValue={editing?.notes ?? ""} />
              </Field>
              {saveError ? (
                <Alert variant="destructive" className="sm:col-span-2">
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              ) : null}
            </form>
          )}
      </EntityDetailSheet>

      <ListShell
        title={isIncome ? "Ingresos" : "Gastos"}
        description={`${filteredEntries.length} movimientos en el periodo`}
        actions={
          isAdmin ? (
            <Button size="sm" onClick={() => openForm()} disabled={!categories.isSuccess}>
              <Plus className="h-4 w-4" /> Nuevo movimiento
            </Button>
          ) : null
        }
        toolbar={
          <ListToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar concepto o categoría…">
            <FilterField label="Desde">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </FilterField>
            <FilterField label="Hasta">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </FilterField>
          </ListToolbar>
        }
        footer={
          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
          />
        }
      >
        <QueryState query={entries} empty={!(entries.data?.length ?? 0)}>
          {() => (
          <div className="px-1 pb-4 pt-2">
          <DataTable maxBodyHeight="min(48vh, 480px)">
            <DataTableHead>
              <DataTableTh>Fecha</DataTableTh>
              <DataTableTh>Concepto</DataTableTh>
              <DataTableTh>Categoría</DataTableTh>
              {isIncome ? <DataTableTh>Método</DataTableTh> : null}
              <DataTableTh className="text-right">Importe</DataTableTh>
            </DataTableHead>
            <tbody>
              {pagination.slice.map((e) => (
                <DataTableRow
                  key={e.id}
                  className={editing?.id === e.id && sheetOpen ? "bg-primary/5" : undefined}
                  onClick={() => isAdmin && openForm(e)}
                >
                  <DataTableTd>{formatDate(e.date)}</DataTableTd>
                  <DataTableTd>{e.concept}</DataTableTd>
                  <DataTableTd>{e.category.name}</DataTableTd>
                  {isIncome ? (
                    <DataTableTd>
                      {paymentMethods.labelOf(e.method)}
                    </DataTableTd>
                  ) : null}
                  <DataTableTd
                    className={`text-right font-medium ${isIncome ? "text-income" : "text-expense"}`}
                  >
                    {formatMoney(e.amount)}
                  </DataTableTd>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
          </div>
          )}
        </QueryState>
      </ListShell>
    </>
  );
}
