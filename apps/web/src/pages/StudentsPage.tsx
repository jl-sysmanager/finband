import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Plus, Receipt, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { StudentFeeGeneratePanel } from "@/components/fees/StudentFeeGeneratePanel";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { QueryState } from "@/components/layout/QueryState";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { ListToolbar } from "@/components/list/ListToolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError, api } from "@/lib/api";
import { buildQuery } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

type StudentRow = {
  id: string;
  firstName: string;
  lastName: string;
  mainInstrument?: string | null;
  level?: string | null;
  status: string;
  primaryTeacher?: { firstName: string; lastName: string } | null;
};

export function StudentsPage() {
  const [search, setSearch] = useState("");
  const [feeStudent, setFeeStudent] = useState<StudentRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const q = useQuery({
    queryKey: ["students", search],
    queryFn: () =>
      api<{ items: StudentRow[]; total: number }>(
        `/students${buildQuery({ search: search || undefined })}`,
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/students/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["students"] });
      setFeeStudent((prev) => (prev?.id === id ? null : prev));
      setDeleteError(null);
    },
  });

  async function deleteStudent(student: StudentRow, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!isAdmin) return;
    if (!confirm(`¿Dar de baja a ${student.firstName} ${student.lastName}?`)) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(student.id);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "No se pudo dar de baja al alumno");
    }
  }

  return (
    <>
      {deleteError ? (
        <Alert variant="destructive" className="page-container mb-4">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      ) : null}
      {feeStudent ? (
        <Card className="page-container mb-4">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <CardTitle className="text-base">
              Cuota — {feeStudent.lastName}, {feeStudent.firstName}
            </CardTitle>
            <Button type="button" size="icon" variant="ghost" onClick={() => setFeeStudent(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <StudentFeeGeneratePanel
              studentId={feeStudent.id}
              onGenerated={() => setFeeStudent(null)}
            />
          </CardContent>
        </Card>
      ) : null}

      <ListPageLayout
        title="Alumnos"
        description={`${q.data?.total ?? 0} registrados`}
        actions={
          isAdmin ? (
            <Button asChild>
              <Link to="/alumnos/nuevo">
                <Plus className="h-4 w-4" /> Nuevo alumno
              </Link>
            </Button>
          ) : null
        }
        toolbar={
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por nombre o email…"
          />
        }
        footer={q.data ? `${q.data.items.length} filas mostradas` : undefined}
      >
        <QueryState
          query={q}
          empty={!q.data?.items.length}
          emptyIcon={GraduationCap}
          emptyTitle="No hay alumnos"
          emptyDescription="Ajusta la búsqueda o crea un nuevo alumno."
          emptyAction={
            isAdmin ? (
              <Button asChild size="sm">
                <Link to="/alumnos/nuevo">Nuevo alumno</Link>
              </Button>
            ) : undefined
          }
        >
          {(data) => (
            <DataTable>
              <DataTableHead>
                <DataTableTh>Nombre</DataTableTh>
                <DataTableTh>Instrumento</DataTableTh>
                <DataTableTh>Nivel</DataTableTh>
                <DataTableTh>Profesor</DataTableTh>
                <DataTableTh>Estado</DataTableTh>
                <DataTableTh className="w-28" />
              </DataTableHead>
              <tbody>
                {data.items.map((s) => (
                  <DataTableRow key={s.id} onClick={() => navigate(`/alumnos/${s.id}`)}>
                    <DataTableTd className="font-medium">
                      {s.lastName}, {s.firstName}
                    </DataTableTd>
                    <DataTableTd>{s.mainInstrument ?? "—"}</DataTableTd>
                    <DataTableTd>{s.level ?? "—"}</DataTableTd>
                    <DataTableTd>
                      {s.primaryTeacher
                        ? `${s.primaryTeacher.firstName} ${s.primaryTeacher.lastName}`
                        : "—"}
                    </DataTableTd>
                    <DataTableTd>
                      <Badge variant={s.status === "ACTIVE" ? "success" : "secondary"}>
                        {s.status === "ACTIVE" ? "Activo" : "Inactivo"}
                      </Badge>
                    </DataTableTd>
                    <DataTableTd className="text-right" onClick={(e) => e.stopPropagation()}>
                      {isAdmin ? (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Generar cuota"
                            onClick={() => setFeeStudent(s)}
                          >
                            <Receipt className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Baja alumno"
                            disabled={remove.isPending}
                            onClick={(e) => void deleteStudent(s, e)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ) : null}
                    </DataTableTd>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTable>
          )}
        </QueryState>
      </ListPageLayout>
    </>
  );
}
