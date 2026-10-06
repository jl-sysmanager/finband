import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Calculator, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { TeacherPayoutPanel } from "@/components/payouts/TeacherPayoutPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { buildQuery, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { PageHeader } from "@/components/list/PageHeader";
import { ListToolbar } from "@/components/list/ListToolbar";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";

type TeacherRow = {
  id: string;
  firstName: string;
  lastName: string;
  specialty?: string;
  hourlyRate: number;
  classGroups: unknown[];
};

export function TeachersPage() {
  const [search, setSearch] = useState("");
  const [payoutTeacher, setPayoutTeacher] = useState<TeacherRow | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const q = useQuery({
    queryKey: ["teachers", search],
    queryFn: () =>
      api<TeacherRow[]>(`/teachers${buildQuery({ search: search || undefined })}`),
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

      {payoutTeacher ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <CardTitle className="text-base">
              Liquidación — {payoutTeacher.lastName}, {payoutTeacher.firstName}
            </CardTitle>
            <Button type="button" size="icon" variant="ghost" onClick={() => setPayoutTeacher(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <TeacherPayoutPanel
              teacherId={payoutTeacher.id}
              onGenerated={() => setPayoutTeacher(null)}
            />
          </CardContent>
        </Card>
      ) : null}

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
              <DataTableTh className="w-28" />
            </DataTableHead>
            <tbody>
              {q.data?.map((t) => (
                <DataTableRow
                  key={t.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/profesores/${t.id}`)}
                >
                  <DataTableTd className="font-medium">
                    {t.lastName}, {t.firstName}
                  </DataTableTd>
                  <DataTableTd>{t.specialty ?? "—"}</DataTableTd>
                  <DataTableTd>{formatMoney(t.hourlyRate)}</DataTableTd>
                  <DataTableTd>{t.classGroups?.length ?? 0}</DataTableTd>
                  <DataTableTd className="text-right" onClick={(e) => e.stopPropagation()}>
                    {isAdmin ? (
                      <>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Calcular liquidación"
                          onClick={() => setPayoutTeacher(t)}
                        >
                          <Calculator className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Eliminar profesor"
                          onClick={() => {
                            if (confirm("¿Eliminar este profesor?")) remove.mutate(t.id);
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
