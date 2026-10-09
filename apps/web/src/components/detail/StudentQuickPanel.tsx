import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StudentFeeGeneratePanel } from "@/components/fees/StudentFeeGeneratePanel";
import { FeeReminderDialog } from "@/components/fees/FeeReminderDialog";
import { StudentEconomicHistory } from "@/components/students/StudentEconomicHistory";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useConfirm } from "@/hooks/useConfirm";
import { FEE_STATUS_LABELS } from "@finband/shared";

type Props = {
  studentId: string;
  onRemoved?: () => void;
};

export function StudentQuickPanel({ studentId, onRemoved }: Props) {
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useState("personal");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reminderFeeId, setReminderFeeId] = useState<string | null>(null);

  const student = useQuery({
    queryKey: ["student", studentId],
    queryFn: () => api<Record<string, unknown>>(`/students/${studentId}`),
  });

  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => api<Array<{ id: string; firstName: string; lastName: string }>>("/teachers"),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/students/${studentId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["student", studentId] });
      setSaveError(null);
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/students/${studentId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      onRemoved?.();
    },
  });

  const deleteFee = useMutation({
    mutationFn: (feeId: string) => api(`/payments/student-fees/${feeId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student", studentId] }),
  });

  const s = student.data as {
    firstName?: string;
    lastName?: string;
    birthDate?: string;
    phone?: string;
    email?: string;
    address?: string;
    legalGuardian?: string;
    notes?: string;
    mainInstrument?: string;
    level?: string;
    primaryTeacherId?: string;
    monthlyFee?: number;
    status?: string;
    enrollments?: Array<{ classGroup: { name: string; teacher: { firstName: string; lastName: string } } }>;
    fees?: Array<{ id: string; yearMonth: string; totalAmount: number; amountPaid: number; status: keyof typeof FEE_STATUS_LABELS }>;
    discounts?: Array<{ id: string; name: string; type: string; value: number }>;
  };

  if (student.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!student.data) return <p className="text-sm text-muted-foreground">No se pudo cargar.</p>;

  function fieldDefault(name: string) {
    const raw = s?.[name as keyof typeof s];
    if (name === "birthDate" && typeof raw === "string") return raw.slice(0, 10);
    return (raw as string | number | undefined) ?? "";
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      if (k === "monthlyFee") body[k] = v ? Number(v) : null;
      else body[k] = v || null;
    });
    if (!body.status) body.status = s?.status ?? "ACTIVE";
    try {
      await save.mutateAsync(body);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  }

  async function deleteStudentFee(feeId: string) {
    const ok = await confirm({
      title: "Eliminar cuota",
      description: "¿Eliminar esta cuota y los cobros asociados?",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteFee.mutateAsync(feeId);
    } catch {
      /* ignore */
    }
  }

  async function deleteStudent() {
    const ok = await confirm({
      title: "Dar de baja",
      description: `¿Dar de baja a ${s.firstName} ${s.lastName}?`,
      confirmLabel: "Dar de baja",
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
      <FeeReminderDialog
        feeId={reminderFeeId}
        open={!!reminderFeeId}
        onOpenChange={(o) => !o && setReminderFeeId(null)}
      />
      <form id={`student-sheet-${studentId}`} onSubmit={onSubmit} className="space-y-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="personal" className="flex-1">
              Personal
            </TabsTrigger>
            <TabsTrigger value="academico" className="flex-1">
              Académico
            </TabsTrigger>
            <TabsTrigger value="economico" className="flex-1">
              Económico
            </TabsTrigger>
          </TabsList>
          <TabsContent value="personal" className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre" name="firstName" defaultValue={fieldDefault("firstName")} disabled={!isAdmin} />
              <Field label="Apellidos" name="lastName" defaultValue={fieldDefault("lastName")} disabled={!isAdmin} />
              <Field label="Nacimiento" name="birthDate" type="date" defaultValue={fieldDefault("birthDate")} disabled={!isAdmin} />
              <Field label="Teléfono" name="phone" defaultValue={fieldDefault("phone")} disabled={!isAdmin} />
              <Field label="Email" name="email" defaultValue={fieldDefault("email")} disabled={!isAdmin} />
              <Field label="Tutor legal" name="legalGuardian" defaultValue={fieldDefault("legalGuardian")} disabled={!isAdmin} />
              <div className="sm:col-span-2 space-y-1">
                <Label>Dirección</Label>
                <Input name="address" defaultValue={fieldDefault("address") as string} disabled={!isAdmin} />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label>Observaciones</Label>
                <Input name="notes" defaultValue={fieldDefault("notes") as string} disabled={!isAdmin} />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="academico" className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Instrumento" name="mainInstrument" defaultValue={fieldDefault("mainInstrument")} disabled={!isAdmin} />
              <Field label="Nivel" name="level" defaultValue={fieldDefault("level")} disabled={!isAdmin} />
              <div className="sm:col-span-2 space-y-1">
                <Label>Profesor</Label>
                <select
                  name="primaryTeacherId"
                  defaultValue={s.primaryTeacherId ?? ""}
                  disabled={!isAdmin}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                >
                  <option value="">—</option>
                  {teachers.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Clases</p>
                <ul className="space-y-1 text-sm">
                  {(s.enrollments ?? []).length === 0 ? (
                    <li className="text-muted-foreground">Sin matrículas</li>
                  ) : (
                    s.enrollments?.map((e, i) => (
                      <li key={i}>
                        {e.classGroup.name} — {e.classGroup.teacher.firstName}{" "}
                        {e.classGroup.teacher.lastName}
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="space-y-1">
                <Label>Estado</Label>
                <select
                  name="status"
                  defaultValue={s.status ?? "ACTIVE"}
                  disabled={!isAdmin}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                >
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                </select>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="economico" className="mt-3 space-y-3">
            <Field
              label="Cuota fija (opc.)"
              name="monthlyFee"
              type="number"
              defaultValue={fieldDefault("monthlyFee")}
              disabled={!isAdmin}
            />
            {isAdmin ? <StudentFeeGeneratePanel studentId={studentId} /> : null}
            <StudentEconomicHistory
              fees={(s.fees ?? []) as Parameters<typeof StudentEconomicHistory>[0]["fees"]}
              discounts={(s.discounts ?? []) as Parameters<typeof StudentEconomicHistory>[0]["discounts"]}
              isAdmin={!!isAdmin}
              deleteFeePending={deleteFee.isPending}
              onDeleteFee={(id) => void deleteStudentFee(id)}
              onReminder={(id) => setReminderFeeId(id)}
            />
          </TabsContent>
        </Tabs>
        {saveError ? (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {s.status ? (
            <Badge variant={s.status === "ACTIVE" ? "success" : "secondary"}>
              {s.status === "ACTIVE" ? "Activo" : "Inactivo"}
            </Badge>
          ) : null}
          {isAdmin ? (
            <>
              <Button type="submit" size="sm" disabled={save.isPending}>
                Guardar
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => void deleteStudent()}>
                Dar de baja
              </Button>
            </>
          ) : null}
        </div>
      </form>
    </>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  disabled,
}: {
  label: string;
  name: string;
  defaultValue: string | number;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input name={name} type={type} defaultValue={defaultValue} disabled={disabled} />
    </div>
  );
}
