import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
              <DataTableTh className="w-24" />
            </DataTableHead>
            <tbody>
              {q.data?.items.map((s) => (
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
                    <Badge>{s.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge>
                  </DataTableTd>
                  <DataTableTd className="text-right">
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
                        <Trash2 className="h-4 w-4 text-expense" />
                      </Button>
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
