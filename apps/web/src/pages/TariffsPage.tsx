import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CLASS_TYPES, CLASS_TYPE_LABELS } from "@finband/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { currentYearMonth, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useState } from "react";

export function TariffsPage() {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const qc = useQueryClient();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [previewStudentId, setPreviewStudentId] = useState("");

  const rules = useQuery({
    queryKey: ["tariffs"],
    queryFn: () =>
      api<Array<{ id: string; name: string; instrument?: string; level?: string; amount: number; priority: number }>>(
        "/tariffs",
      ),
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

  const createRule = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/tariffs", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tariffs"] }),
  });

  async function onCreateRule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    const fd = new FormData(e.currentTarget);
    await createRule.mutateAsync({
      name: fd.get("name"),
      instrument: fd.get("instrument") || null,
      level: fd.get("level") || null,
      classType: fd.get("classType") || null,
      amount: Number(fd.get("amount")),
      priority: Number(fd.get("priority") || 0),
    });
    e.currentTarget.reset();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Tarifas</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Reglas de tarifa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th>Nombre</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {rules.data?.map((r) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="py-2">{r.name}</td>
                    <td>{formatMoney(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isAdmin ? (
              <form onSubmit={onCreateRule} className="grid gap-2 md:grid-cols-2">
                <Input name="name" placeholder="Nombre" required />
                <Input name="amount" type="number" step="0.01" placeholder="Importe" required />
                <Input name="instrument" placeholder="Instrumento (opc.)" />
                <Input name="level" placeholder="Nivel (opc.)" />
                <select name="classType" className="h-10 rounded-lg border border-border bg-card px-3 text-sm">
                  <option value="">Tipo clase (opc.)</option>
                  {CLASS_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CLASS_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <Input name="priority" type="number" placeholder="Prioridad" defaultValue={0} />
                <Button type="submit" className="md:col-span-2">
                  Añadir regla
                </Button>
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
                  <Input
                    value={yearMonth}
                    onChange={(e) => setYearMonth(e.target.value)}
                    placeholder="YYYY-MM"
                  />
                  <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                    Generar
                  </Button>
                </div>
                {generate.data ? (
                  <p className="text-sm text-muted-foreground">
                    Generadas: {(generate.data as { generated: number }).generated} cuotas
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
