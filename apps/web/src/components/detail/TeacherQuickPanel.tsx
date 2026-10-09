import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TeacherPayoutPanel } from "@/components/payouts/TeacherPayoutPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError, api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useConfirm } from "@/hooks/useConfirm";

type Props = {
  teacherId: string;
  onRemoved?: () => void;
};

const FIELDS: Array<[string, string, string?]> = [
  ["firstName", "Nombre"],
  ["lastName", "Apellidos"],
  ["phone", "Teléfono"],
  ["email", "Email"],
  ["specialty", "Especialidad"],
  ["hourlyRate", "Precio por hora", "number"],
  ["monthlySalary", "Salario mensual", "number"],
  ["costPerClass", "Coste por clase", "number"],
  ["weeklyHours", "Horas semanales", "number"],
  ["transportCostPerDay", "Transporte por jornada (€)", "number"],
];

export function TeacherQuickPanel({ teacherId, onRemoved }: Props) {
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [saveError, setSaveError] = useState<string | null>(null);

  const teacher = useQuery({
    queryKey: ["teacher", teacherId],
    queryFn: () => api<Record<string, unknown>>(`/teachers/${teacherId}`),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/teachers/${teacherId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
      qc.invalidateQueries({ queryKey: ["teacher", teacherId] });
      setSaveError(null);
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/teachers/${teacherId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
      onRemoved?.();
    },
  });

  const t = teacher.data as {
    firstName?: string;
    lastName?: string;
    payouts?: Array<{
      yearMonth: string;
      amount: number;
      baseAmount: number;
      transportAmount: number;
      workDays: number;
      amountPaid: number;
      status: string;
    }>;
    classGroups?: Array<{ name: string }>;
  };

  if (teacher.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!teacher.data) return <p className="text-sm text-muted-foreground">No se pudo cargar.</p>;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      if (
        ["hourlyRate", "monthlySalary", "costPerClass", "weeklyHours", "transportCostPerDay"].includes(
          k,
        )
      ) {
        body[k] = v ? Number(v) : k === "transportCostPerDay" ? 0 : null;
      } else body[k] = v || null;
    });
    try {
      await save.mutateAsync(body);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  }

  async function deleteTeacher() {
    const ok = await confirm({
      title: "Eliminar profesor",
      description: `¿Eliminar a ${t.firstName} ${t.lastName}?`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync();
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      {confirmDialog}
      <form onSubmit={onSubmit} className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">{t.classGroups?.length ?? 0} clase(s) asignada(s)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(([name, label, type]) => (
            <div key={name} className="space-y-1">
              <Label>{label}</Label>
              <Input
                name={name}
                type={type ?? "text"}
                defaultValue={(t?.[name as keyof typeof t] as string | number | undefined) ?? ""}
                disabled={!isAdmin}
              />
            </div>
          ))}
        </div>
        {isAdmin ? (
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Liquidación mensual</p>
            <TeacherPayoutPanel teacherId={teacherId} />
          </div>
        ) : null}
        {t.payouts?.length ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Historial</p>
            <ul className="space-y-2">
              {t.payouts.map((p, i) => (
                <li key={i} className="rounded-md bg-muted/30 px-2 py-1.5">
                  {p.yearMonth}: {formatMoney(p.amountPaid)} / {formatMoney(p.amount)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {saveError ? (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}
        {isAdmin ? (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button type="submit" size="sm" disabled={save.isPending}>
              Guardar
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => void deleteTeacher()}>
              Eliminar
            </Button>
          </div>
        ) : null}
      </form>
    </>
  );
}
