import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { CLASS_TYPES, CLASS_TYPE_LABELS, type ClassType } from "@finband/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useState } from "react";

export function ClassDetailPage() {
  const { id } = useParams();
  const isNew = id === "nueva";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const [studentId, setStudentId] = useState("");
  const [sessionDate, setSessionDate] = useState("");

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

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew
        ? api<{ id: string }>("/classes", { method: "POST", body: JSON.stringify(body) })
        : api<{ id: string }>(`/classes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (data: { id?: string }) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      if (isNew && data?.id) navigate(`/clases/${data.id}`);
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
        body: JSON.stringify({ sessionDate }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["class", id] }),
  });

  const c = cls.data as {
    name?: string;
    type?: ClassType;
    teacherId?: string;
    room?: string;
    durationMinutes?: number;
    maxStudents?: number;
    scheduleJson?: string;
    notes?: string;
    enrollments?: Array<{ student: { id: string; firstName: string; lastName: string } }>;
    sessions?: Array<{
      id: string;
      sessionDate: string;
      records: Array<{ studentId: string; present: boolean }>;
    }>;
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      if (k === "durationMinutes" || k === "maxStudents") body[k] = Number(v);
      else body[k] = v;
    });
    if (!body.scheduleJson) body.scheduleJson = "[]";
    await save.mutateAsync(body);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{isNew ? "Nueva clase" : c?.name}</h1>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Configuración de la clase</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input name="name" defaultValue={c?.name ?? ""} disabled={!isAdmin} />
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
            <div className="md:col-span-2 space-y-1">
              <Label>Horario (JSON)</Label>
              <Input
                name="scheduleJson"
                defaultValue={c?.scheduleJson ?? "[]"}
                disabled={!isAdmin}
              />
            </div>
          </CardContent>
        </Card>
        {isAdmin ? (
          <Button type="submit" className="mt-4" disabled={save.isPending}>
            Guardar
          </Button>
        ) : null}
      </form>

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
                  <Button
                    type="button"
                    disabled={!studentId}
                    onClick={() => enroll.mutate()}
                  >
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
                <div className="flex flex-wrap gap-2">
                  <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
                  <Button
                    type="button"
                    disabled={!sessionDate}
                    onClick={() => addSession.mutate()}
                  >
                    Crear sesión
                  </Button>
                </div>
              ) : null}
              {(c?.sessions ?? []).map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{formatDate(s.sessionDate)}</p>
                  <p className="text-muted-foreground">
                    Presentes: {s.records.filter((r) => r.present).length}/{s.records.length}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
