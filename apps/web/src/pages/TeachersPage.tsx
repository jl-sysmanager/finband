import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { QueryState } from "@/components/layout/QueryState";
import { TeacherPayoutPanel } from "@/components/payouts/TeacherPayoutPanel";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { ListToolbar } from "@/components/list/ListToolbar";
import { RowActionsMenu } from "@/components/list/RowActionsMenu";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, api } from "@/lib/api";
import { buildQuery, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useConfirm } from "@/hooks/useConfirm";

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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { confirm, dialog: confirmDialog } = useConfirm();

  const q = useQuery({
    queryKey: ["teachers", search],
    queryFn: () =>
      api<TeacherRow[]>(`/teachers${buildQuery({ search: search || undefined })}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/teachers/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
      setPayoutTeacher((prev) => (prev?.id === id ? null : prev));
      setDeleteError(null);
    },
  });

  async function deleteTeacher(teacher: TeacherRow) {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Eliminar profesor",
      description: `¿Eliminar a ${teacher.firstName} ${teacher.lastName}?`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(teacher.id);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar al profesor");
    }
  }

  return (
    <>
      {confirmDialog}
      {deleteError ? (
        <Alert variant="destructive" className="page-container mb-4">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      ) : null}

      <Dialog open={!!payoutTeacher} onOpenChange={(o) => !o && setPayoutTeacher(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              Liquidación — {payoutTeacher?.lastName}, {payoutTeacher?.firstName}
            </DialogTitle>
          </DialogHeader>
          {payoutTeacher ? (
            <TeacherPayoutPanel
              teacherId={payoutTeacher.id}
              onGenerated={() => setPayoutTeacher(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ListPageLayout
        title="Profesores"
        description={`${q.data?.length ?? 0} en plantilla`}
        actions={
          isAdmin ? (
            <Button asChild size="sm">
              <Link to="/profesores/nuevo">
                <Plus className="h-4 w-4" /> Nuevo profesor
              </Link>
            </Button>
          ) : null
        }
        toolbar={
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por nombre o especialidad…"
          />
        }
      >
        <QueryState
          query={q}
          empty={!q.data?.length}
          emptyIcon={Users}
          emptyTitle="No hay profesores"
          emptyDescription="Crea un profesor para asignar clases."
        >
          {(data) => (
            <DataTable>
              <DataTableHead>
                <DataTableTh>Nombre</DataTableTh>
                <DataTableTh>Especialidad</DataTableTh>
                <DataTableTh>€/hora</DataTableTh>
                <DataTableTh>Clases</DataTableTh>
                {isAdmin ? <DataTableTh className="w-14" /> : null}
              </DataTableHead>
              <tbody>
                {data.map((t) => (
                  <DataTableRow key={t.id} onClick={() => navigate(`/profesores/${t.id}`)}>
                    <DataTableTd className="font-medium">
                      {t.lastName}, {t.firstName}
                    </DataTableTd>
                    <DataTableTd>{t.specialty ?? "—"}</DataTableTd>
                    <DataTableTd>{formatMoney(t.hourlyRate)}</DataTableTd>
                    <DataTableTd>{t.classGroups?.length ?? 0}</DataTableTd>
                    {isAdmin ? (
                      <DataTableTd className="text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu
                          actions={[
                            {
                              label: "Liquidación",
                              icon: <Calculator className="h-4 w-4" />,
                              onSelect: () => setPayoutTeacher(t),
                            },
                            {
                              label: "Eliminar",
                              icon: <Trash2 className="h-4 w-4" />,
                              destructive: true,
                              disabled: remove.isPending,
                              onSelect: () => void deleteTeacher(t),
                            },
                          ]}
                        />
                      </DataTableTd>
                    ) : null}
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
