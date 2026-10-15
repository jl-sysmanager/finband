import { useQuery } from "@tanstack/react-query";
import { DataTable, DataTableHead, DataTableRow, DataTableTd, DataTableTh } from "@/components/list/DataTable";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

export function AuditLogTable() {
  const logs = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () =>
      api<
        Array<{
          id: string;
          username: string;
          action: string;
          entityType: string;
          entityId: string | null;
          details: string | null;
          createdAt: string;
        }>
      >("/admin/audit-logs?limit=40"),
  });

  if (logs.isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <DataTable>
      <DataTableHead>
        <DataTableTh>Fecha</DataTableTh>
        <DataTableTh>Usuario</DataTableTh>
        <DataTableTh>Acción</DataTableTh>
        <DataTableTh>Entidad</DataTableTh>
      </DataTableHead>
      <tbody>
        {(logs.data ?? []).map((row) => (
          <DataTableRow key={row.id}>
            <DataTableTd className="text-xs">{formatDateTime(row.createdAt)}</DataTableTd>
            <DataTableTd>{row.username}</DataTableTd>
            <DataTableTd>{row.action}</DataTableTd>
            <DataTableTd className="text-xs text-muted-foreground">
              {row.entityType}
              {row.entityId ? ` · ${row.entityId.slice(0, 8)}…` : ""}
            </DataTableTd>
          </DataTableRow>
        ))}
      </tbody>
    </DataTable>
  );
}
