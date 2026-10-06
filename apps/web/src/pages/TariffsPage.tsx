import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CLASS_TYPES, CLASS_TYPE_LABELS } from "@finband/shared";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FormSelect } from "@/components/form/FormSelect";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { ListToolbar } from "@/components/list/ListToolbar";
import { RowActionsMenu } from "@/components/list/RowActionsMenu";
import { PageHeader } from "@/components/list/PageHeader";
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
  const [formOpen, setFormOpen] = useState(false);
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
      setFormOpen(false);
      setEditing(null);
    },
  });

  const removeRule = useMutation({
    mutationFn: (id: string) => api(`/tariffs/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["tariffs"] });
      if (editing?.id === id) {
        setFormOpen(false);
        setEditing(null);
      }
      setDeleteError(null);
    },
  });

  useEffect(() => {
    if (formOpen) {
      setClassType(editing?.classType ?? NONE_CLASS);
    }
  }, [formOpen, editing]);

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

  function openForm(rule?: Rule) {
    setSaveError(null);
    setDeleteError(null);
    setEditing(rule ?? null);
    setFormOpen(true);
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
    <div className="page-container space-y-4">
      {confirmDialog}
      <PageHeader
        title="Tarifas"
        description={`${filteredRules.length} reglas · La generación de cuotas se hace desde cada alumno`}
        actions={
          isAdmin ? (
            <Button size="sm" onClick={() => openForm()}>
              <Plus className="h-4 w-4" /> Nueva tarifa
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
            <DialogTitle>{editing ? "Editar tarifa" : "Nueva tarifa"}</DialogTitle>
          </DialogHeader>
          <form key={editing?.id ?? "new"} onSubmit={onSubmitRule} className="grid gap-3 md:grid-cols-2">
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
            <FormSelect
              value={classType}
              onValueChange={setClassType}
              options={classTypeOptions}
            />
            <Input name="priority" type="number" placeholder="Prioridad" defaultValue={editing?.priority ?? 0} />
            {saveError ? (
              <p className="md:col-span-2 text-sm text-destructive">{saveError}</p>
            ) : null}
            <DialogFooter className="md:col-span-2 pt-2">
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
              <Button type="button" variant="outline" size="sm" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={saveRule.isPending}>
                {editing ? "Guardar" : "Añadir"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden">
        <ListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar tarifa, instrumento o nivel…"
        />
        <CardContent className="pt-4">
          <DataTable>
            <DataTableHead>
              <DataTableTh>Nombre</DataTableTh>
              <DataTableTh>Importe</DataTableTh>
              {isAdmin ? <DataTableTh className="w-14" /> : null}
            </DataTableHead>
            <tbody>
              {filteredRules.map((r) => (
                <DataTableRow key={r.id} onClick={() => isAdmin && openForm(r)}>
                  <DataTableTd>{r.name}</DataTableTd>
                  <DataTableTd>{formatMoney(r.amount)}</DataTableTd>
                  {isAdmin ? (
                    <DataTableTd className="text-right" onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu
                        actions={[
                          { label: "Editar", onSelect: () => openForm(r) },
                          {
                            label: "Eliminar",
                            destructive: true,
                            onSelect: () => void deleteRule(r),
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
