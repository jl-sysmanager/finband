import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CLASS_TYPE_LABELS, weekdayLabel, type ClassType } from "@finband/shared";
import {
  WeeklyCalendarGrid,
  type ScheduleOccurrence,
} from "@/components/schedule/WeeklyCalendarGrid";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { ListToolbar } from "@/components/list/ListToolbar";
import { WorkspaceShell } from "@/components/layout/PageShell";
import { SegmentedControl } from "@/components/layout/SegmentedControl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, api } from "@/lib/api";
import { addDaysIso, buildQuery, mondayOfWeek, todayISO } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { RowActionsMenu } from "@/components/list/RowActionsMenu";
import { useConfirm } from "@/hooks/useConfirm";
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Trash2 } from "lucide-react";

export function ClassesPage() {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [search, setSearch] = useState("");
  const [weekAnchor, setWeekAnchor] = useState(todayISO());
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { confirm, dialog: confirmDialog } = useConfirm();

  const weekStart = useMemo(() => mondayOfWeek(weekAnchor), [weekAnchor]);
  const weekEnd = useMemo(() => addDaysIso(weekStart, 6), [weekStart]);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["classes", search],
    queryFn: () =>
      api<
        Array<{
          id: string;
          name: string;
          type: ClassType;
          room?: string;
          teacher: { firstName: string; lastName: string };
          scheduleSlots?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
          _count: { enrollments: number };
          maxStudents: number;
        }>
      >(`/classes${buildQuery({ search: search || undefined })}`),
  });

  const occurrences = useQuery({
    queryKey: ["schedule-occurrences", weekStart],
    queryFn: () =>
      api<{ from: string; to: string; items: ScheduleOccurrence[] }>(
        `/classes/schedule/occurrences${buildQuery({ week: weekStart })}`,
      ),
    enabled: view === "calendar",
  });

  const cancelSession = useMutation({
    mutationFn: (occ: ScheduleOccurrence) =>
      api("/classes/schedule/cancellations", {
        method: "POST",
        body: JSON.stringify({
          scheduleSlotId: occ.scheduleSlotId,
          sessionDate: occ.sessionDate,
          reason: "Festivo / libranza",
        }),
      }),
    onSuccess: async () => {
      setCalendarError(null);
      await qc.refetchQueries({ queryKey: ["schedule-occurrences", weekStart] });
    },
    onError: (err) => {
      setCalendarError(err instanceof ApiError ? err.message : "No se pudo suspender la sesión");
    },
  });

  const restoreSession = useMutation({
    mutationFn: (occ: ScheduleOccurrence) =>
      api("/classes/schedule/cancellations/restore", {
        method: "POST",
        body: JSON.stringify({
          scheduleSlotId: occ.scheduleSlotId,
          sessionDate: occ.sessionDate,
        }),
      }),
    onSuccess: async () => {
      setCalendarError(null);
      await qc.refetchQueries({ queryKey: ["schedule-occurrences", weekStart] });
    },
    onError: (err) => {
      setCalendarError(err instanceof ApiError ? err.message : "No se pudo restaurar la sesión");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/classes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["schedule-occurrences"] });
      setDeleteError(null);
    },
  });

  async function deleteClass(cls: { id: string; name: string }) {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Eliminar clase",
      description: `¿Eliminar la clase «${cls.name}»?`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(cls.id);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar la clase");
    }
  }

  const items = useMemo(() => {
    const list = occurrences.data?.items ?? [];
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(
      (e) =>
        e.className.toLowerCase().includes(s) ||
        e.teacherName.toLowerCase().includes(s) ||
        (e.room?.toLowerCase().includes(s) ?? false),
    );
  }, [occurrences.data?.items, search]);

  const suspended = items.filter((o) => o.cancelled);

  return (
    <WorkspaceShell
      title="Clases"
      description={`${q.data?.length ?? 0} grupos`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "Listado" },
              { value: "calendar", label: "Calendario" },
            ]}
          />
          {isAdmin ? (
            <Button asChild size="sm">
              <Link to="/clases/nueva">
                <Plus className="h-4 w-4" /> Nueva clase
              </Link>
            </Button>
          ) : null}
        </div>
      }
    >
      {confirmDialog}

      {deleteError ? (
        <Alert variant="destructive">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <ListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar clase, profesor o aula…"
        />
        {view === "calendar" ? (
          <CardContent className="space-y-4 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Semana del {weekStart} al {weekEnd}. Las franjas semanales se mantienen; puede
                suspender sesiones puntuales (festivos o libranza) con ✕ en el calendario.
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Semana anterior"
                  onClick={() => setWeekAnchor(addDaysIso(weekStart, -7))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setWeekAnchor(todayISO())}>
                  Hoy
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Semana siguiente"
                  onClick={() => setWeekAnchor(addDaysIso(weekStart, 7))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <WeeklyCalendarGrid
              weekStartIso={weekStart}
              occurrences={items}
              isAdmin={isAdmin}
              onCancel={async (occ) => {
                const ok = await confirm({
                  title: "Suspender sesión",
                  description: `¿Suspender "${occ.className}" el ${occ.sessionDate} (${occ.startTime})?`,
                  confirmLabel: "Suspender",
                  destructive: true,
                });
                if (ok) cancelSession.mutate(occ);
              }}
            />
            {calendarError ? (
              <Alert variant="destructive">
                <AlertDescription>{calendarError}</AlertDescription>
              </Alert>
            ) : null}
            {suspended.length > 0 ? (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                <p className="mb-2 font-medium">Sesiones suspendidas esta semana</p>
                <ul className="space-y-2">
                  {suspended.map((o) => (
                    <li
                      key={`${o.scheduleSlotId}-${o.sessionDate}`}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>
                        {o.sessionDate} · {o.className} · {o.startTime}–{o.endTime}
                        {o.reason ? ` — ${o.reason}` : ""}
                      </span>
                      {isAdmin ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={restoreSession.isPending}
                          onClick={() => restoreSession.mutate(o)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        ) : (
          <CardContent className="pt-4">
            <DataTable>
              <DataTableHead>
                <DataTableTh>Nombre</DataTableTh>
                <DataTableTh>Tipo</DataTableTh>
                <DataTableTh>Profesor</DataTableTh>
                <DataTableTh>Horario</DataTableTh>
                <DataTableTh>Aula</DataTableTh>
                <DataTableTh>Alumnos</DataTableTh>
                <DataTableTh className="w-24" />
              </DataTableHead>
              <tbody>
                {q.data?.map((c) => (
                  <DataTableRow key={c.id} onClick={() => navigate(`/clases/${c.id}`)}>
                    <DataTableTd className="font-medium">{c.name}</DataTableTd>
                    <DataTableTd>{CLASS_TYPE_LABELS[c.type]}</DataTableTd>
                    <DataTableTd>
                      {c.teacher.firstName} {c.teacher.lastName}
                    </DataTableTd>
                    <DataTableTd className="text-muted-foreground">
                      {(c.scheduleSlots ?? []).length === 0
                        ? "—"
                        : c.scheduleSlots?.map((s, i) => (
                            <span key={i} className="block text-xs">
                              {weekdayLabel(s.dayOfWeek, true)} {s.startTime}–{s.endTime}
                            </span>
                          ))}
                    </DataTableTd>
                    <DataTableTd>{c.room ?? "—"}</DataTableTd>
                    <DataTableTd>
                      {c._count.enrollments}/{c.maxStudents}
                    </DataTableTd>
                    <DataTableTd className="text-right" onClick={(e) => e.stopPropagation()}>
                      {isAdmin ? (
                        <RowActionsMenu
                          actions={[
                            {
                              label: "Eliminar",
                              icon: <Trash2 className="h-4 w-4" />,
                              destructive: true,
                              onSelect: () => void deleteClass(c),
                            },
                          ]}
                        />
                      ) : null}
                    </DataTableTd>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTable>
          </CardContent>
        )}
      </Card>
    </WorkspaceShell>
  );
}
