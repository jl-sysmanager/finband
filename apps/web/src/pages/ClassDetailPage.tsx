import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CLASS_TYPES, CLASS_TYPE_LABELS, weekdayLabel, type ClassType } from "@finband/shared";
import {
  WeeklyScheduleEditor,
  type ScheduleSlotDraft,
} from "@/components/schedule/WeeklyScheduleEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useSyncPageTitle } from "@/stores/page-title";
import { DetailPageLayout } from "@/components/layout/DetailPageLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export function ClassDetailPage() {
  const { id } = useParams();
  const isNew = id === "nueva";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const [studentId, setStudentId] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotDraft[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const cls = useQuery({
    queryKey: ["class", id],
    queryFn: () => api<Record<string, unknown>>(`/classes/${id}`),
    enabled: !isNew && !!id,
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
    scheduleSlots?: ScheduleSlotDraft[];
    enrollments?: Array<{ student: { id: string; firstName: string; lastName: string } }>;
    sessions?: Array<{
      id: string;
      sessionDate: string;
      records: Array<{ studentId: string; present: boolean }>;
    }>;
  };

  useEffect(() => {
    if (isNew) {
      setScheduleSlots([]);
      return;
    }
    if (!cls.data) return;
    const slots = (cls.data as { scheduleSlots?: ScheduleSlotDraft[] }).scheduleSlots ?? [];
    setScheduleSlots(
      slots.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    );
  }, [isNew, id, cls.data]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew
        ? api<{ id: string }>("/classes", { method: "POST", body: JSON.stringify(body) })
        : api<{ id: string }>(`/classes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (data: { id?: string }) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["weekly-schedule"] });
      if (isNew && data?.id) navigate(`/clases/${data.id}`);
      else qc.invalidateQueries({ queryKey: ["class", id] });
    },
  });

  const enroll = useMutation({
    mutationFn: () =>
      api(`/classes/${id}/enrollments`, {
        method: "POST",
        body: JSON.stringify({ studentId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["class", id] }),
  });

  const addSession = useMutation({
    mutationFn: () =>
      api(`/classes/${id}/sessions`, {
        method: "POST",
        body: JSON.stringify({ sessionDate: new Date(sessionDate).toISOString() }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["class", id] }),
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
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar la clase");
    }
  }

  useSyncPageTitle(isNew ? null : c?.name ?? null);

  if (!isNew && cls.isLoading) {
    return (
      <div className="page-container space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isNew && cls.isError) {
    return (
      <Alert variant="destructive" className="page-container">
        <AlertDescription>No se pudo cargar la clase.</AlertDescription>
      </Alert>
    );
  }

  return (
    <DetailPageLayout
      backTo="/clases"
      title={isNew ? "Nueva clase" : c?.name ?? "Clase"}
      footerActions={
        isAdmin ? (
          <Button type="submit" form="class-form" disabled={save.isPending} className="w-full md:w-auto">
            Guardar
          </Button>
        ) : undefined
      }
    >
      <form id="class-form" key={isNew ? "new" : id} onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Configuración de la clase</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input name="name" defaultValue={c?.name ?? ""} disabled={!isAdmin} required />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <select
                name="type"
                defaultValue={c?.type ?? "INDIVIDUAL"}
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
                defaultValue={c?.teacherId ?? ""}
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
              <Input name="room" defaultValue={c?.room ?? ""} disabled={!isAdmin} />
            </div>
            <div className="space-y-1">
              <Label>Duración (min)</Label>
              <Input
                name="durationMinutes"
                type="number"
                defaultValue={c?.durationMinutes ?? 60}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-1">
              <Label>Máx. alumnos</Label>
              <Input
                name="maxStudents"
                type="number"
                defaultValue={c?.maxStudents ?? 1}
                disabled={!isAdmin}
              />
            </div>
            <div className="md:col-span-2">
              <WeeklyScheduleEditor
                value={scheduleSlots}
                onChange={setScheduleSlots}
                disabled={!isAdmin}
              />
            </div>
          </CardContent>
        </Card>
        {saveError ? (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}
      </form>

      {!isNew && scheduleSlots.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Resumen horario</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="space-y-1">
              {scheduleSlots.map((s, i) => (
                <li key={i}>
                  {weekdayLabel(s.dayOfWeek)} · {s.startTime} – {s.endTime}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {!isNew ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Alumnos inscritos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="text-sm">
                {(c?.enrollments ?? []).map((e) => (
                  <li key={e.student.id}>
                    {e.student.firstName} {e.student.lastName}
                  </li>
                ))}
              </ul>
              {isAdmin ? (
                <div className="flex flex-wrap gap-2">
                  <select
                    className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
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
                  <Button type="button" disabled={!studentId} onClick={() => enroll.mutate()}>
                    Inscribir
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Asistencia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isAdmin ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label>Fecha y hora de la sesión</Label>
                    <Input
                      type="datetime-local"
                      value={sessionDate}
                      onChange={(e) => setSessionDate(e.target.value)}
                    />
                  </div>
                  <Button type="button" disabled={!sessionDate} onClick={() => addSession.mutate()}>
                    Crear sesión
                  </Button>
                </div>
              ) : null}
              {(c?.sessions ?? []).map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{formatDateTime(s.sessionDate)}</p>
                  <p className="text-muted-foreground">
                    Presentes: {s.records.filter((r) => r.present).length}/{s.records.length}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </DetailPageLayout>
  );
}
