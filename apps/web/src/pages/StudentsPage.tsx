import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Receipt, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { StudentFeeGeneratePanel } from "@/components/fees/StudentFeeGeneratePanel";
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
        <ListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por nombre o email…"
        />
        <CardContent className="pt-4">
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
                    <Badge>{s.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge>
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
                    ) : null}
                  </DataTableTd>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        </CardContent>
      </Card>
    </div>
  );
}
