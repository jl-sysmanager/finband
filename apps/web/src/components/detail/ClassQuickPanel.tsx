import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CLASS_TYPES, CLASS_TYPE_LABELS, weekdayLabel, type ClassType } from "@finband/shared";
import {
  WeeklyScheduleEditor,
  type ScheduleSlotDraft,
} from "@/components/schedule/WeeklyScheduleEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useConfirm } from "@/hooks/useConfirm";

type Props = {
  classId: string;
  onRemoved?: () => void;
};

export function ClassQuickPanel({ classId, onRemoved }: Props) {
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [studentId, setStudentId] = useState("");
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotDraft[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const cls = useQuery({
    queryKey: ["class", classId],
    queryFn: () => api<Record<string, unknown>>(`/classes/${classId}`),
  });

  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => api<Array<{ id: string; firstName: string; lastName: string }>>("/teachers"),
  });

  const students = useQuery({
    queryKey: ["students-all"],
    queryFn: () => api<{ items: Array<{ id: string; firstName: string; lastName: string }> }>("/students?limit=500"),
  });

  const c = cls.data as {
    name?: string;
    type?: ClassType;
    teacherId?: string;
    room?: string;
    durationMinutes?: number;
    maxStudents?: number;
    notes?: string;
    enrollments?: Array<{ student: { id: string; firstName: string; lastName: string } }>;
  };

  useEffect(() => {
    if (!cls.data) return;
    const slots = (cls.data as { scheduleSlots?: ScheduleSlotDraft[] }).scheduleSlots ?? [];
    setScheduleSlots(
      slots.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    );
  }, [cls.data]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/classes/${classId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["class", classId] });
      qc.invalidateQueries({ queryKey: ["schedule-occurrences"] });
      setSaveError(null);
    },
  });

  const enroll = useMutation({
    mutationFn: () =>
      api(`/classes/${classId}/enrollments`, {
        method: "POST",
        body: JSON.stringify({ studentId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class", classId] });
      setStudentId("");
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/classes/${classId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["schedule-occurrences"] });
      onRemoved?.();
    },
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const body: Record<string, unknown> = { scheduleSlots };
    fd.forEach((v, k) => {
      if (k === "durationMinutes" || k === "maxStudents") body[k] = Number(v);
      else if (k !== "scheduleSlots") body[k] = v;
    });
    try {
      await save.mutateAsync(body);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  }

  async function deleteClass() {
    const ok = await confirm({
      title: "Eliminar clase",
      description: `¿Eliminar «${c.name}»?`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
  }

  if (cls.isLoading) return <Skeleton className="h-48 w-full" />;
  if (!cls.data) return <p className="text-sm text-muted-foreground">No se pudo cargar.</p>;

  return (
    <>
      {confirmDialog}
      <form onSubmit={onSubmit} className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Nombre</Label>
            <Input name="name" defaultValue={c.name ?? ""} disabled={!isAdmin} required />
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <select
              name="type"
              defaultValue={c.type ?? "INDIVIDUAL"}
              disabled={!isAdmin}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
            >
              {CLASS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CLASS_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Profesor</Label>
            <select
              name="teacherId"
              defaultValue={c.teacherId ?? ""}
              disabled={!isAdmin}
              required
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
            >
              <option value="">Seleccionar…</option>
              {teachers.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.firstName} {t.lastName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Aula</Label>
            <Input name="room" defaultValue={c.room ?? ""} disabled={!isAdmin} />
          </div>
          <div className="space-y-1">
            <Label>Duración (min)</Label>
            <Input
              name="durationMinutes"
              type="number"
              defaultValue={c.durationMinutes ?? 60}
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-1">
            <Label>Máx. alumnos</Label>
            <Input name="maxStudents" type="number" defaultValue={c.maxStudents ?? 1} disabled={!isAdmin} />
          </div>
        </div>
        <WeeklyScheduleEditor value={scheduleSlots} onChange={setScheduleSlots} disabled={!isAdmin} />
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Alumnos inscritos</p>
          <ul className="mb-2 space-y-1">
            {(c.enrollments ?? []).map((e) => (
              <li key={e.student.id}>
                {e.student.firstName} {e.student.lastName}
              </li>
            ))}
          </ul>
          {isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <select
                className="h-10 min-w-[160px] flex-1 rounded-lg border border-border bg-card px-3 text-sm"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="">Añadir alumno…</option>
                {students.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </option>
                ))}
              </select>
              <Button type="button" size="sm" disabled={!studentId} onClick={() => enroll.mutate()}>
                Inscribir
              </Button>
            </div>
          ) : null}
        </div>
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
            <Button type="button" size="sm" variant="destructive" onClick={() => void deleteClass()}>
              Eliminar clase
            </Button>
          </div>
        ) : null}
      </form>
      {scheduleSlots.length > 0 ? (
        <div className="mt-4 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
          {scheduleSlots.map((s, i) => (
            <div key={i}>
              {weekdayLabel(s.dayOfWeek)} · {s.startTime}–{s.endTime}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
