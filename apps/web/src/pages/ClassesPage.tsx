import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CLASS_TYPE_LABELS, weekdayLabel, type ClassType } from "@finband/shared";
import {
  WeeklyCalendarGrid,
  type CalendarEvent,
} from "@/components/schedule/WeeklyCalendarGrid";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { ListToolbar } from "@/components/list/ListToolbar";
import { PageHeader } from "@/components/list/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { buildQuery } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { Pencil, Plus, Trash2 } from "lucide-react";

export function ClassesPage() {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
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

  const filteredCalendar = useMemo(() => {
    if (!search.trim()) return undefined;
    const s = search.toLowerCase();
    return (events: CalendarEvent[]) =>
      events.filter(
        (e) =>
          e.className.toLowerCase().includes(s) ||
          e.teacherName.toLowerCase().includes(s) ||
          (e.room?.toLowerCase().includes(s) ?? false),
      );
  }, [search]);

  const weekly = useQuery({
    queryKey: ["weekly-schedule"],
    queryFn: () => api<CalendarEvent[]>("/classes/schedule/weekly"),
    enabled: view === "calendar",
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/classes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["weekly-schedule"] });
    },
  });

  const calendarEvents = weekly.data ?? [];
  const calendarFiltered = filteredCalendar
    ? filteredCalendar(calendarEvents)
    : calendarEvents;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clases"
        description={`${q.data?.length ?? 0} grupos`}
        actions={
          <>
            <Button
              size="sm"
              variant={view === "list" ? "default" : "outline"}
              onClick={() => setView("list")}
            >
              Listado
            </Button>
            <Button
              size="sm"
              variant={view === "calendar" ? "default" : "outline"}
              onClick={() => setView("calendar")}
            >
              Calendario
            </Button>
            {isAdmin ? (
              <Button asChild>
                <Link to="/clases/nueva">
                  <Plus className="h-4 w-4" /> Nueva clase
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <Card>
        <ListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar clase, profesor o aula…"
        />
        {view === "calendar" ? (
          <CardContent className="pt-4">
            <WeeklyCalendarGrid events={calendarFiltered} />
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
                  <DataTableRow key={c.id}>
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
                    <DataTableTd className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Editar clase"
                        onClick={() => navigate(`/clases/${c.id}`)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {isAdmin ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Eliminar clase"
                          onClick={() => {
                            if (confirm("¿Eliminar esta clase?")) remove.mutate(c.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-expense" />
                        </Button>
                      ) : null}
                    </DataTableTd>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTable>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
