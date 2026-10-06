import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Receipt, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { StudentFeeGeneratePanel } from "@/components/fees/StudentFeeGeneratePanel";
import { GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { QueryState } from "@/components/layout/QueryState";
import {
  DataTable,
  DataTableActions,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { ListToolbar } from "@/components/list/ListToolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students"] }),
  });

  return (
    <div className="space-y-4">
      <PageHeader
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
      />

      {feeStudent ? (
        <Card>
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

      <Card>
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
              {q.data?.items.map((s) => (
                <DataTableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/alumnos/${s.id}`)}
                >
              {data.items.map((s) => (
                <DataTableRow key={s.id}>
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
                          onClick={() => {
                            if (confirm("¿Dar de baja a este alumno?")) remove.mutate(s.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-expense" />
                        </Button>
                      </>
                  <DataTableActions>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Editar alumno"
                      onClick={() => navigate(`/alumnos/${s.id}`)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {isAdmin ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Baja alumno"
                        onClick={() => {
                          if (confirm("¿Dar de baja a este alumno?")) remove.mutate(s.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    ) : null}
                  </DataTableActions>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        )}
      </QueryState>
    </ListPageLayout>
  );
}
