import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CLASS_TYPES, CLASS_TYPE_LABELS } from "@finband/shared";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthSelect } from "@/components/form/MonthSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListToolbar } from "@/components/list/ListToolbar";
import { PageHeader } from "@/components/list/PageHeader";
import { ApiError, api } from "@/lib/api";
import { currentYearMonth, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useMemo } from "react";

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
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [previewStudentId, setPreviewStudentId] = useState("");
  const [editing, setEditing] = useState<Rule | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const rules = useQuery({
    queryKey: ["tariffs"],
    queryFn: () => api<Rule[]>("/tariffs"),
  });

  const students = useQuery({
    queryKey: ["students-all"],
    queryFn: () => api<{ items: Array<{ id: string; firstName: string; lastName: string }> }>("/students?limit=500"),
  });

  const preview = useQuery({
    queryKey: ["tariff-preview", previewStudentId],
    queryFn: () =>
      api<{ totalAmount: number; lineItems: Array<{ label: string; amount: number }> }>(
        "/tariffs/preview",
        { method: "POST", body: JSON.stringify({ studentId: previewStudentId }) },
      ),
    enabled: !!previewStudentId,
  });

  const generate = useMutation({
    mutationFn: () =>
      api("/tariffs/generate-month", {
        method: "POST",
        body: JSON.stringify({ yearMonth }),
      }),
  });

  const saveRule = useMutation({
    mutationFn: (body: Record<string, unknown> & { id?: string }) =>
      body.id
        ? api(`/tariffs/${body.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api("/tariffs", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tariffs"] });
      setEditing(null);
    },
  });

  const removeRule = useMutation({
    mutationFn: (id: string) => api(`/tariffs/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tariffs"] }),
  });

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

  async function onSubmitRule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await saveRule.mutateAsync({
        id: editing?.id,
        name: fd.get("name"),
        instrument: fd.get("instrument") || null,
        level: fd.get("level") || null,
        classType: fd.get("classType") || null,
        amount: Number(fd.get("amount")),
        priority: Number(fd.get("priority") || 0),
      });
      form.reset();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar la tarifa");
    }
  }

  return (
    <div className="page-container space-y-4">
      <PageHeader title="Tarifas" description={`${filteredRules.length} reglas activas`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar tarifa, instrumento o nivel…"
          />
          <CardContent className="space-y-4 pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th>Nombre</th>
                  <th>Importe</th>
                  {isAdmin ? <th className="w-24" /> : null}
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((r) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="py-2">{r.name}</td>
                    <td>{formatMoney(r.amount)}</td>
                    {isAdmin ? (
                      <td className="py-2 text-right">
                        <Button size="icon" variant="ghost" onClick={() => setEditing(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("¿Eliminar esta tarifa?")) removeRule.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-expense" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {isAdmin ? (
              <form
                key={editing?.id ?? "new"}
                onSubmit={onSubmitRule}
                className="grid gap-2 md:grid-cols-2 border-t border-border pt-4"
              >
                <p className="md:col-span-2 text-sm font-medium">
                  {editing ? "Editar tarifa" : "Nueva tarifa"}
                </p>
                <Input name="name" placeholder="Nombre" required defaultValue={editing?.name ?? ""} />
                <Input name="amount" type="number" step="0.01" placeholder="Importe" required defaultValue={editing?.amount ?? ""} />
                <Input name="instrument" placeholder="Instrumento (opc.)" defaultValue={editing?.instrument ?? ""} />
                <Input name="level" placeholder="Nivel (opc.)" defaultValue={editing?.level ?? ""} />
                <select name="classType" className="h-10 rounded-lg border border-border bg-card px-3 text-sm" defaultValue={editing?.classType ?? ""}>
                  <option value="">Tipo clase (opc.)</option>
                  {CLASS_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CLASS_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <Input name="priority" type="number" placeholder="Prioridad" defaultValue={editing?.priority ?? 0} />
                {saveError ? <p className="md:col-span-2 text-sm text-destructive">{saveError}</p> : null}
                <div className="md:col-span-2 flex gap-2">
                  <Button type="submit" disabled={saveRule.isPending}>
                    <Plus className="h-4 w-4" /> {editing ? "Guardar cambios" : "Añadir regla"}
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
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Simulador y generación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Vista previa por alumno</Label>
              <select
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                value={previewStudentId}
                onChange={(e) => setPreviewStudentId(e.target.value)}
              >
                <option value="">Seleccionar alumno…</option>
                {students.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </option>
                ))}
              </select>
              {preview.data ? (
                <div className="mt-2 text-sm">
                  <p className="font-medium">Total: {formatMoney(preview.data.totalAmount)}</p>
                  <ul className="text-muted-foreground">
                    {preview.data.lineItems.map((l, i) => (
                      <li key={i}>
                        {l.label}: {formatMoney(l.amount)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            {isAdmin ? (
              <div className="space-y-2 border-t border-border pt-4">
                <Label>Generar cuotas del mes</Label>
                <div className="flex gap-2">
                  <MonthSelect className="max-w-xs" value={yearMonth} onChange={setYearMonth} />
                  <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                    Generar
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
