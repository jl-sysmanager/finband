import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { CLASS_TYPES, CLASS_TYPE_LABELS, weekdayLabel, type ClassType } from "@finband/shared";
import { UserMinus } from "lucide-react";
import { TeacherSelect } from "@/components/form/TeacherSelect";
import {
  WeeklyScheduleEditor,
  type ScheduleSlotDraft,
} from "@/components/schedule/WeeklyScheduleEditor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { invalidateClassQueries } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";

export type EnrolledStudent = { id: string; firstName: string; lastName: string };

export type ClassData = {
  id: string;
  name: string;
  type: ClassType;
  teacherId: string;
  room?: string | null;
  durationMinutes: number;
  maxStudents: number;
  notes?: string | null;
  scheduleSlots?: ScheduleSlotDraft[];
  enrollments?: Array<{ student: EnrolledStudent }>;
};

const selectClass = "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm";

/**
 * Formulario de clase compartido por la ficha y el panel lateral.
 * Se monta con `key` = id de la clase: el horario editable se inicializa desde el
 * servidor al abrirla, sin sincronizar estado en un efecto ni perder lo que se
 * está editando cuando se refrescan los datos.
 */
export function ClassForm({
  formId,
  cls,
  isAdmin,
  compact,
  onSubmit,
  children,
}: {
  formId?: string;
  cls?: ClassData;
  isAdmin: boolean;
  /** Panel lateral: rejilla más estrecha y resumen de horario debajo. */
  compact?: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>;
  /** Acciones dentro del formulario (botones del panel). */
  children?: ReactNode;
}) {
  const uid = useId();
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotDraft[]>(() =>
    (cls?.scheduleSlots ?? []).map(({ dayOfWeek, startTime, endTime }) => ({
      dayOfWeek,
      startTime,
      endTime,
    })),
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { scheduleSlots };
    fd.forEach((v, k) => {
      body[k] = k === "durationMinutes" || k === "maxStudents" ? Number(v) : v;
    });
    try {
      await onSubmit(body);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar la clase");
    }
  }

  const field = (name: string) => `${uid}-${name}`;
  const grid = compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-4 md:grid-cols-2";

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4 text-sm">
      <div className={grid}>
        <div className={cn("space-y-1", compact && "sm:col-span-2")}>
          <Label htmlFor={field("name")}>Nombre</Label>
          <Input id={field("name")} name="name" defaultValue={cls?.name ?? ""} disabled={!isAdmin} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor={field("type")}>Tipo</Label>
          <select
            id={field("type")}
            name="type"
            defaultValue={cls?.type ?? "INDIVIDUAL"}
            disabled={!isAdmin}
            className={selectClass}
          >
            {CLASS_TYPES.map((t) => (
              <option key={t} value={t}>
                {CLASS_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={field("teacherId")}>Profesor</Label>
          <TeacherSelect
            id={field("teacherId")}
            name="teacherId"
            defaultValue={cls?.teacherId}
            disabled={!isAdmin}
            required
            emptyLabel="Seleccionar…"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={field("room")}>Aula</Label>
          <Input id={field("room")} name="room" defaultValue={cls?.room ?? ""} disabled={!isAdmin} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={field("durationMinutes")}>Duración (min)</Label>
          <Input
            id={field("durationMinutes")}
            name="durationMinutes"
            type="number"
            min={1}
            defaultValue={cls?.durationMinutes ?? 60}
            disabled={!isAdmin}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={field("maxStudents")}>Máx. alumnos</Label>
          <Input
            id={field("maxStudents")}
            name="maxStudents"
            type="number"
            min={1}
            defaultValue={cls?.maxStudents ?? 1}
            disabled={!isAdmin}
          />
        </div>
        <div className={compact ? "sm:col-span-2" : "md:col-span-2"}>
          <WeeklyScheduleEditor value={scheduleSlots} onChange={setScheduleSlots} disabled={!isAdmin} />
        </div>
      </div>
      {saveError ? (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
      {children}
    </form>
  );
}

export function ClassScheduleSummary({ slots }: { slots: ScheduleSlotDraft[] }) {
  if (slots.length === 0) return null;
  return (
    <ul className="space-y-1">
      {slots.map((s) => (
        <li key={`${s.dayOfWeek}-${s.startTime}`}>
          {weekdayLabel(s.dayOfWeek)} · {s.startTime} – {s.endTime}
        </li>
      ))}
    </ul>
  );
}

/** Alumnos inscritos: alta y baja de matrículas. */
export function ClassEnrollments({
  classId,
  enrollments,
  isAdmin,
}: {
  classId: string;
  enrollments: Array<{ student: EnrolledStudent }>;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const uid = useId();
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const students = useQuery({
    queryKey: ["students", "options"],
    queryFn: () => api<EnrolledStudent[]>("/students/options"),
    enabled: isAdmin,
  });

  const onDone = () => {
    setError(null);
    invalidateClassQueries(qc, classId);
    // Las matrículas cambian la cuota del alumno.
    void qc.invalidateQueries({ queryKey: ["student"] });
    void qc.invalidateQueries({ queryKey: ["bulk-fee-preview"] });
  };
  const onError = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : "No se pudo actualizar la matrícula");

  const enroll = useMutation({
    mutationFn: () =>
      api(`/classes/${classId}/enrollments`, { method: "POST", body: JSON.stringify({ studentId }) }),
    onSuccess: () => {
      setStudentId("");
      onDone();
    },
    onError,
  });
  const unenroll = useMutation({
    mutationFn: (id: string) => api(`/classes/${classId}/enrollments/${id}`, { method: "DELETE" }),
    onSuccess: onDone,
    onError,
  });

  const enrolledIds = new Set(enrollments.map((e) => e.student.id));

  return (
    <div className="space-y-3 text-sm">
      {enrollments.length === 0 ? (
        <p className="text-muted-foreground">Sin alumnos inscritos.</p>
      ) : (
        <ul className="space-y-1">
          {enrollments.map(({ student }) => (
            <li key={student.id} className="flex items-center justify-between gap-2">
              <span>
                {student.firstName} {student.lastName}
              </span>
              {isAdmin ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Dar de baja a ${student.firstName} ${student.lastName}`}
                  disabled={unenroll.isPending}
                  onClick={() => unenroll.mutate(student.id)}
                >
                  <UserMinus className="h-4 w-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {isAdmin ? (
        <div className="flex flex-wrap gap-2">
          <label htmlFor={`${uid}-student`} className="sr-only">
            Alumno a inscribir
          </label>
          <select
            id={`${uid}-student`}
            className="h-10 min-w-[160px] flex-1 rounded-lg border border-border bg-card px-3 text-sm"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">Añadir alumno…</option>
            {students.data
              ?.filter((s) => !enrolledIds.has(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={!studentId || enroll.isPending}
            onClick={() => enroll.mutate()}
          >
            Inscribir
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  );
}
