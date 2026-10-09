import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CLASS_TYPES, CLASS_TYPE_LABELS } from "@finband/shared";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TablePagination } from "@/components/list/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import { FormSelect } from "@/components/form/FormSelect";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EntityDetailSheet } from "@/components/layout/EntityDetailSheet";
import { SheetFooter } from "@/components/ui/sheet";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { ListToolbar } from "@/components/list/ListToolbar";
import { ListShell } from "@/components/layout/PageShell";
import { QueryState } from "@/components/layout/QueryState";
import { ApiError, api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useConfirm } from "@/hooks/useConfirm";

const NONE_CLASS = "__none__";

type Rule = {
  id: string;
  name: string;
  instrument?: string | null;
  level?: string | null;
  classType?: string | null;
  amount: number;
  priority: number;
  active?: boolean;
};

export function TariffsPage() {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const qc = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [classType, setClassType] = useState(NONE_CLASS);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const rules = useQuery({
    queryKey: ["tariffs"],
    queryFn: () => api<Rule[]>("/tariffs"),
  });

  const saveRule = useMutation({
    mutationFn: (body: Record<string, unknown> & { id?: string }) => {
      const { id, ...data } = body;
      return id
        ? api(`/tariffs/${id}`, { method: "PATCH", body: JSON.stringify(data) })
        : api("/tariffs", { method: "POST", body: JSON.stringify(data) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tariffs"] });
      setSheetOpen(false);
      setEditing(null);
    },
  });

  const removeRule = useMutation({
    mutationFn: (id: string) => api(`/tariffs/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["tariffs"] });
      if (editing?.id === id) {
        setSheetOpen(false);
        setEditing(null);
      }
      setDeleteError(null);
    },
  });

  useEffect(() => {
    if (sheetOpen) {
      setClassType(editing?.classType ?? NONE_CLASS);
    }
  }, [sheetOpen, editing]);

  const filteredRules = useMemo(() => {
    if (!search.trim()) return rules.data ?? [];
    const s = search.toLowerCase();
    return (rules.data ?? []).filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        (r.instrument?.toLowerCase().includes(s) ?? false) ||
        (r.level?.toLowerCase().includes(s) ?? false),
    );
  }, [rules.data, search]);

  const pagination = usePagination(filteredRules, 12);

  useEffect(() => {
    pagination.setPage(1);
  }, [search]);

  function openForm(rule?: Rule) {
    setSaveError(null);
    setDeleteError(null);
    setEditing(rule ?? null);
    setSheetOpen(true);
  }

  async function deleteRule(rule: Rule) {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Eliminar tarifa",
      description: `¿Eliminar la tarifa «${rule.name}»?`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    setDeleteError(null);
    try {
      await removeRule.mutateAsync(rule.id);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar la tarifa");
    }
  }

  async function onSubmitRule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const ct = classType === NONE_CLASS ? null : classType;
    try {
      await saveRule.mutateAsync({
        id: editing?.id,
        name: fd.get("name"),
        instrument: fd.get("instrument") || null,
        level: fd.get("level") || null,
        classType: ct,
        amount: Number(fd.get("amount")),
        priority: Number(fd.get("priority") || 0),
      });
      form.reset();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar la tarifa");
    }
  }

  const classTypeOptions = [
    { value: NONE_CLASS, label: "Tipo clase (opc.)" },
    ...CLASS_TYPES.map((t) => ({ value: t, label: CLASS_TYPE_LABELS[t] })),
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
        title={editing ? editing.name : "Nueva tarifa"}
        description="Regla de precio y criterios de aplicación"
        footer={
          isAdmin ? (
            <SheetFooter className="w-full border-0 bg-transparent p-0">
              {editing ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={removeRule.isPending}
                  onClick={() => void deleteRule(editing)}
                >
                  <Trash2 className="h-4 w-4" /> Eliminar
                </Button>
              ) : null}
              <Button type="submit" form="tariff-sheet-form" size="sm" disabled={saveRule.isPending}>
                {editing ? "Guardar" : "Añadir"}
              </Button>
            </SheetFooter>
          ) : undefined
        }
      >
        {isAdmin ? (
          <form
            id="tariff-sheet-form"
            key={editing?.id ?? "new"}
            onSubmit={onSubmitRule}
            className="grid gap-3 sm:grid-cols-2"
          >
            <Input name="name" placeholder="Nombre" required defaultValue={editing?.name ?? ""} />
            <Input
              name="amount"
              type="number"
              step="0.01"
              placeholder="Importe"
              required
              defaultValue={editing?.amount ?? ""}
            />
            <Input name="instrument" placeholder="Instrumento (opc.)" defaultValue={editing?.instrument ?? ""} />
            <Input name="level" placeholder="Nivel (opc.)" defaultValue={editing?.level ?? ""} />
            <FormSelect value={classType} onValueChange={setClassType} options={classTypeOptions} />
            <Input name="priority" type="number" placeholder="Prioridad" defaultValue={editing?.priority ?? 0} />
            {saveError ? <p className="sm:col-span-2 text-sm text-destructive">{saveError}</p> : null}
          </form>
        ) : null}
      </EntityDetailSheet>

      <ListShell
        title="Tarifas"
        description={`${filteredRules.length} reglas`}
        actions={
          isAdmin ? (
            <Button size="sm" onClick={() => openForm()}>
              <Plus className="h-4 w-4" /> Nueva tarifa
            </Button>
          ) : null
        }
        toolbar={
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar tarifa, instrumento o nivel…"
          />
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
        <QueryState
          query={rules}
          empty={!(rules.data?.length ?? 0)}
          emptyDescription={
            isAdmin
              ? "Crea la primera regla con «Nueva tarifa» en la cabecera."
              : "No hay tarifas configuradas."
          }
        >
          {() => (
          <div className="px-1 pb-4 pt-2">
          <DataTable maxBodyHeight="min(48vh, 480px)">
            <DataTableHead>
              <DataTableTh>Nombre</DataTableTh>
              <DataTableTh>Importe</DataTableTh>
            </DataTableHead>
            <tbody>
              {pagination.slice.map((r) => (
                <DataTableRow
                  key={r.id}
                  className={editing?.id === r.id && sheetOpen ? "bg-primary/5" : undefined}
                  onClick={() => isAdmin && openForm(r)}
                >
                  <DataTableTd>{r.name}</DataTableTd>
                  <DataTableTd>{formatMoney(r.amount)}</DataTableTd>
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
