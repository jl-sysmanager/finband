import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StudentQuickPanel } from "@/components/detail/StudentQuickPanel";
import { EntityDetailSheet } from "@/components/layout/EntityDetailSheet";
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
import { TablePagination } from "@/components/list/TablePagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
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
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { dialog: confirmDialog } = useConfirm();

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

  return (
    <>
      {confirmDialog}

      <EntityDetailSheet
        open={!!selectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
        size="xl"
        title={
          selectedRow ? `${selectedRow.lastName}, ${selectedRow.firstName}` : "Alumno"
        }
        description="Datos, cuotas y acciones"
      >
        {selectedId ? (
          <StudentQuickPanel studentId={selectedId} onRemoved={() => setSelectedId(null)} />
        ) : null}
      </EntityDetailSheet>

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
          emptyDescription={
            isAdmin
              ? "Ajusta la búsqueda o usa «Nuevo alumno» en la cabecera."
              : "Ajusta la búsqueda."
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
