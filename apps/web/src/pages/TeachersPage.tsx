import { useQuery } from "@tanstack/react-query";
import { Layers, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TeacherQuickPanel } from "@/components/detail/TeacherQuickPanel";
import { EntityDetailSheet } from "@/components/layout/EntityDetailSheet";
import { TablePagination } from "@/components/list/TablePagination";
import { usePagination } from "@/hooks/usePagination";
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
import { api } from "@/lib/api";
import { BulkPayoutGenerateDialog } from "@/components/payouts/BulkPayoutGenerateDialog";
import { formatMoney } from "@/lib/utils";
import { PAY_RATE_UNITS, type PayMethod } from "@finband/shared";
import { useAuth } from "@/stores/auth";

type TeacherRow = {
  id: string;
  firstName: string;
  lastName: string;
  specialty?: string;
  payMethod: PayMethod;
  payRate: number;
  classGroups: unknown[];
};

export function TeachersPage() {
  const [search, setSearch] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");

  const q = useQuery({
    // Lista completa (pocos profesores) y filtro en cliente: sin una petición por tecla.
    queryKey: ["teachers"],
    queryFn: () => api<TeacherRow[]>("/teachers"),
  });

  const filtered = useMemo(() => {
    const rows = q.data ?? [];
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter(
      (t) =>
        t.firstName.toLowerCase().includes(s) ||
        t.lastName.toLowerCase().includes(s) ||
        (t.specialty?.toLowerCase().includes(s) ?? false),
    );
  }, [q.data, search]);

  const pagination = usePagination(filtered, 12, search);
  const selectedRow = filtered.find((t) => t.id === selectedId);

  return (
    <>
      {isAdmin ? <BulkPayoutGenerateDialog open={bulkOpen} onOpenChange={setBulkOpen} /> : null}
      <EntityDetailSheet
        open={!!selectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
        size="xl"
        title={
          selectedRow ? `${selectedRow.lastName}, ${selectedRow.firstName}` : "Profesor"
        }
        description="Datos, liquidaciones y acciones"
      >
        {selectedId ? (
          <TeacherQuickPanel teacherId={selectedId} onRemoved={() => setSelectedId(null)} />
        ) : null}
      </EntityDetailSheet>

      <ListPageLayout
        title="Profesores"
        description={`${filtered.length} en plantilla`}
        footer={
          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
          />
        }
        actions={
          isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
                <Layers className="h-4 w-4" /> Generar liquidaciones
              </Button>
              <Button asChild size="sm">
                <Link to="/profesores/nuevo">
                  <Plus className="h-4 w-4" /> Nuevo profesor
                </Link>
              </Button>
            </div>
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
          {() => (
            <DataTable maxBodyHeight="min(52vh, 520px)">
              <DataTableHead>
                <DataTableTh>Nombre</DataTableTh>
                <DataTableTh>Especialidad</DataTableTh>
                <DataTableTh>Honorarios</DataTableTh>
                <DataTableTh>Clases</DataTableTh>
              </DataTableHead>
              <tbody>
                {pagination.slice.map((t) => (
                  <DataTableRow
                    key={t.id}
                    className={selectedId === t.id ? "bg-primary/5" : undefined}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <DataTableTd className="font-medium">
                      {t.lastName}, {t.firstName}
                    </DataTableTd>
                    <DataTableTd>{t.specialty ?? "—"}</DataTableTd>
                    <DataTableTd>
                      {formatMoney(t.payRate)} {PAY_RATE_UNITS[t.payMethod].replace("€", "").trim()}
                    </DataTableTd>
                    <DataTableTd>{t.classGroups?.length ?? 0}</DataTableTd>
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
