import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { buildQuery, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/list/PageHeader";
import { ListToolbar } from "@/components/list/ListToolbar";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";

export function TeachersPage() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const q = useQuery({
    queryKey: ["teachers", search],
    queryFn: () =>
      api<
        Array<{
          id: string;
          firstName: string;
          lastName: string;
          specialty?: string;
          hourlyRate: number;
          classGroups: unknown[];
        }>
      >(`/teachers${buildQuery({ search: search || undefined })}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/teachers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teachers"] }),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Profesores"
        description={`${q.data?.length ?? 0} en plantilla`}
        actions={
          isAdmin ? (
            <Button asChild>
              <Link to="/profesores/nuevo">
                <Plus className="h-4 w-4" /> Nuevo profesor
              </Link>
            </Button>
          ) : null
        }
      />
      <Card>
        <ListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por nombre o especialidad…"
        />
        <CardContent className="pt-4">
          <DataTable>
            <DataTableHead>
              <DataTableTh>Nombre</DataTableTh>
              <DataTableTh>Especialidad</DataTableTh>
              <DataTableTh>€/hora</DataTableTh>
              <DataTableTh>Clases</DataTableTh>
              <DataTableTh className="w-24" />
            </DataTableHead>
            <tbody>
              {q.data?.map((t) => (
                <DataTableRow key={t.id}>
                  <DataTableTd className="font-medium">
                    {t.lastName}, {t.firstName}
                  </DataTableTd>
                  <DataTableTd>{t.specialty ?? "—"}</DataTableTd>
                  <DataTableTd>{formatMoney(t.hourlyRate)}</DataTableTd>
                  <DataTableTd>{t.classGroups?.length ?? 0}</DataTableTd>
                  <DataTableTd className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Editar profesor"
                      onClick={() => navigate(`/profesores/${t.id}`)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {isAdmin ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Eliminar profesor"
                        onClick={() => {
                          if (confirm("¿Eliminar este profesor?")) remove.mutate(t.id);
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
