import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Plus, Receipt, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StudentQuickPanel } from "@/components/detail/StudentQuickPanel";
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
import { RowActionsMenu } from "@/components/list/RowActionsMenu";
import { TablePagination } from "@/components/list/TablePagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError, api } from "@/lib/api";
import { buildQuery } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useConfirm } from "@/hooks/useConfirm";

const PAGE_SIZE = 12;

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
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feeStudent, setFeeStudent] = useState<StudentRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    setPage(1);
  }, [search]);

  const q = useQuery({
    queryKey: ["students", search, page],
    queryFn: () =>
      api<{ items: StudentRow[]; total: number; page: number; limit: number }>(
        `/students${buildQuery({ search: search || undefined, page: String(page), limit: String(PAGE_SIZE) })}`,
      ),
  });

  const totalPages = Math.max(1, Math.ceil((q.data?.total ?? 0) / PAGE_SIZE));
  const selectedRow = q.data?.items.find((s) => s.id === selectedId);

  const remove = useMutation({
    mutationFn: (id: string) => api(`/students/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["students"] });
      setFeeStudent((prev) => (prev?.id === id ? null : prev));
      if (selectedId === id) setSelectedId(null);
      setDeleteError(null);
    },
  });

  async function deleteStudent(student: StudentRow) {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Dar de baja al alumno",
      description: `¿Dar de baja a ${student.firstName} ${student.lastName}?`,
      confirmLabel: "Dar de baja",
      destructive: true,
    });
    if (!ok) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(student.id);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "No se pudo dar de baja al alumno");
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

      <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent size="lg">
          <SheetHeader>
            <SheetTitle>
              {selectedRow
                ? `${selectedRow.lastName}, ${selectedRow.firstName}`
                : "Alumno"}
            </SheetTitle>
            <SheetDescription>Vista rápida · sin salir del listado</SheetDescription>
          </SheetHeader>
          <SheetBody>{selectedId ? <StudentQuickPanel studentId={selectedId} /> : null}</SheetBody>
        </SheetContent>
      </Sheet>

      <Dialog open={!!feeStudent} onOpenChange={(o) => !o && setFeeStudent(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              Cuota — {feeStudent?.lastName}, {feeStudent?.firstName}
            </DialogTitle>
          </DialogHeader>
          {feeStudent ? (
            <StudentFeeGeneratePanel
              studentId={feeStudent.id}
              onGenerated={() => setFeeStudent(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ListPageLayout
        title="Alumnos"
        description={`${q.data?.total ?? 0} registrados`}
        actions={
          isAdmin ? (
            <Button asChild size="sm">
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
        footer={
          q.data ? (
            <TablePagination
              page={page}
              totalPages={totalPages}
              totalItems={q.data.total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          ) : undefined
        }
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
            <DataTable maxBodyHeight="min(52vh, 520px)">
              <DataTableHead>
                <DataTableTh>Nombre</DataTableTh>
                <DataTableTh>Instrumento</DataTableTh>
                <DataTableTh>Nivel</DataTableTh>
                <DataTableTh>Profesor</DataTableTh>
                <DataTableTh>Estado</DataTableTh>
                {isAdmin ? <DataTableTh className="w-14" /> : null}
              </DataTableHead>
              <tbody>
                {data.items.map((s) => (
                  <DataTableRow
                    key={s.id}
                    className={selectedId === s.id ? "bg-primary/5" : undefined}
                    onClick={() => setSelectedId(s.id)}
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
                      <Badge variant={s.status === "ACTIVE" ? "success" : "secondary"}>
                        {s.status === "ACTIVE" ? "Activo" : "Inactivo"}
                      </Badge>
                    </DataTableTd>
                    {isAdmin ? (
                      <DataTableTd className="text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu
                          actions={[
                            {
                              label: "Generar cuota",
                              icon: <Receipt className="h-4 w-4" />,
                              onSelect: () => setFeeStudent(s),
                            },
                            {
                              label: "Dar de baja",
                              icon: <Trash2 className="h-4 w-4" />,
                              destructive: true,
                              disabled: remove.isPending,
                              onSelect: () => void deleteStudent(s),
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
