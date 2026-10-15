import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { FeeReminderDialog } from "@/components/fees/FeeReminderDialog";
import { StudentFeeGeneratePanel } from "@/components/fees/StudentFeeGeneratePanel";
import { TeacherSelect } from "@/components/form/TeacherSelect";
import {
  StudentEconomicHistory,
  type StudentDiscountRow,
  type StudentFeeRow,
} from "@/components/students/StudentEconomicHistory";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/hooks/useConfirm";
import { ApiError, api } from "@/lib/api";
import { invalidateFinanceQueries } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";

export type StudentData = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  legalGuardian?: string | null;
  notes?: string | null;
  mainInstrument?: string | null;
  level?: string | null;
  primaryTeacherId?: string | null;
  monthlyFee?: number | null;
  status: "ACTIVE" | "INACTIVE";
  enrollments?: Array<{
    active?: boolean;
    classGroup: { name: string; teacher: { firstName: string; lastName: string } };
  }>;
  fees?: StudentFeeRow[];
  discounts?: StudentDiscountRow[];
};

const selectClass = "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm";

/**
 * Formulario de alumno compartido por la ficha y el panel lateral. Un único
 * formulario abarca las tres pestañas, que se mantienen montadas para que se
 * envíen todos los campos aunque no estén visibles.
 */
export function StudentForm({
  formId,
  student,
  isAdmin,
  compact,
  onSubmit,
  children,
}: {
  formId?: string;
  student?: StudentData;
  isAdmin: boolean;
  compact?: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>;
  /** Acciones dentro del formulario (botones del panel). */
  children?: ReactNode;
}) {
  const uid = useId();
  const [tab, setTab] = useState("personal");
  const [saveError, setSaveError] = useState<string | null>(null);
  const isNew = !student;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      if (k === "monthlyFee") body[k] = v ? Number(v) : null;
      else body[k] = v || null;
    });
    if (isNew) body.status = "ACTIVE";
    try {
      await onSubmit(body);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar el alumno");
    }
  }

  const id = (name: string) => `${uid}-${name}`;
  const value = (name: keyof StudentData) => {
    const raw = student?.[name];
    if (name === "birthDate" && typeof raw === "string") return raw.slice(0, 10);
    return (raw as string | number | null | undefined) ?? "";
  };
  const field = (name: keyof StudentData, label: string, type = "text", wide = false) => (
    <div className={cn("space-y-1", wide && (compact ? "sm:col-span-2" : "md:col-span-2"))}>
      <Label htmlFor={id(name)}>{label}</Label>
      <Input
        id={id(name)}
        name={name}
        type={type}
        step={type === "number" ? "0.01" : undefined}
        min={type === "number" ? 0 : undefined}
        defaultValue={value(name)}
        disabled={!isAdmin}
        required={name === "firstName" || name === "lastName"}
      />
    </div>
  );
  const grid = compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-4 md:grid-cols-2";
  const content = compact ? "mt-3 space-y-3" : undefined;
  const activeEnrollments = (student?.enrollments ?? []).filter((e) => e.active !== false);

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className={compact ? "w-full" : undefined}>
          <TabsTrigger value="personal" className={compact ? "flex-1" : undefined}>
            Personal
          </TabsTrigger>
          <TabsTrigger value="academico" className={compact ? "flex-1" : undefined}>
            Académico
          </TabsTrigger>
          <TabsTrigger value="economico" className={compact ? "flex-1" : undefined}>
            Económico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" keepMounted className={content}>
          <div className={grid}>
            {field("firstName", "Nombre")}
            {field("lastName", "Apellidos")}
            {field("birthDate", "Fecha de nacimiento", "date")}
            {field("phone", "Teléfono", "tel")}
            {field("email", "Email", "email")}
            {field("legalGuardian", "Tutor legal")}
            {field("address", "Dirección", "text", true)}
            {field("notes", "Observaciones", "text", true)}
          </div>
        </TabsContent>

        <TabsContent value="academico" keepMounted className={content}>
          <div className={grid}>
            {field("mainInstrument", "Instrumento principal")}
            {field("level", "Nivel")}
            <div className="space-y-1">
              <Label htmlFor={id("primaryTeacherId")}>Profesor asignado</Label>
              <TeacherSelect
                id={id("primaryTeacherId")}
                name="primaryTeacherId"
                defaultValue={student?.primaryTeacherId}
                disabled={!isAdmin}
              />
            </div>
            {!isNew ? (
              <div className="space-y-1">
                <Label htmlFor={id("status")}>Estado</Label>
                <select
                  id={id("status")}
                  name="status"
                  defaultValue={student.status}
                  disabled={!isAdmin}
                  className={selectClass}
                >
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                </select>
              </div>
            ) : null}
            {!isNew ? (
              <div className={compact ? "sm:col-span-2" : "md:col-span-2"}>
                <p className="mb-1 text-sm font-medium">Clases matriculadas</p>
                {activeEnrollments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin matrículas activas.</p>
                ) : (
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {activeEnrollments.map((e, i) => (
                      <li key={i}>
                        {e.classGroup.name} — Prof. {e.classGroup.teacher.firstName}{" "}
                        {e.classGroup.teacher.lastName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="economico" keepMounted className={content}>
          <div className={grid}>{field("monthlyFee", "Cuota mensual fija (opcional)", "number")}</div>
          {student ? (
            <div className="mt-4">
              <StudentEconomicSection student={student} isAdmin={isAdmin} />
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
      {saveError ? (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
      {children}
    </form>
  );
}

/** Generar cuota, historial económico, borrar cuotas y recordatorios. */
function StudentEconomicSection({ student, isAdmin }: { student: StudentData; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [reminderFeeId, setReminderFeeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deleteFee = useMutation({
    mutationFn: (feeId: string) => api(`/payments/student-fees/${feeId}`, { method: "DELETE" }),
    onSuccess: () => {
      setError(null);
      void invalidateFinanceQueries(qc);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar la cuota"),
  });

  async function removeFee(feeId: string) {
    const ok = await confirm({
      title: "Eliminar cuota",
      description: "¿Eliminar esta cuota? Se borrarán también los cobros asociados.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) deleteFee.mutate(feeId);
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <FeeReminderDialog
        feeId={reminderFeeId}
        open={!!reminderFeeId}
        onOpenChange={(o) => !o && setReminderFeeId(null)}
      />
      {isAdmin ? <StudentFeeGeneratePanel studentId={student.id} /> : null}
      <StudentEconomicHistory
        fees={student.fees ?? []}
        discounts={student.discounts ?? []}
        isAdmin={isAdmin}
        deleteFeePending={deleteFee.isPending}
        onDeleteFee={(feeId) => void removeFee(feeId)}
        onReminder={(feeId) => setReminderFeeId(feeId)}
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
