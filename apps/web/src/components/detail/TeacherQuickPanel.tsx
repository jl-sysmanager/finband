import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TeacherPayoutPanel } from "@/components/payouts/TeacherPayoutPanel";
import {
  TeacherForm,
  TeacherPayoutHistory,
  type TeacherData,
} from "@/components/teachers/TeacherForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/hooks/useConfirm";
import { ApiError, api } from "@/lib/api";
import { invalidateTeacherQueries } from "@/lib/query-invalidation";
import { useAuth } from "@/stores/auth";
import { toast } from "@/stores/toast";

type Props = {
  teacherId: string;
  onRemoved?: () => void;
};

export function TeacherQuickPanel({ teacherId, onRemoved }: Props) {
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { confirm, dialog: confirmDialog } = useConfirm();

  const teacher = useQuery({
    queryKey: ["teacher", teacherId],
    queryFn: () => api<TeacherData>(`/teachers/${teacherId}`),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/teachers/${teacherId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidateTeacherQueries(qc, teacherId);
      toast("Profesor guardado", "success");
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/teachers/${teacherId}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateTeacherQueries(qc);
      onRemoved?.();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "No se pudo eliminar", "error"),
  });

  if (teacher.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!teacher.data) return <p className="text-sm text-muted-foreground">No se pudo cargar.</p>;
  const t = teacher.data;

  async function deleteTeacher() {
    const ok = await confirm({
      title: "Eliminar profesor",
      description: `¿Eliminar a ${t.firstName} ${t.lastName}?`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) remove.mutate();
  }

  return (
    <>
      {confirmDialog}
      <div className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">{t.classGroups?.length ?? 0} clase(s) asignada(s)</p>
        <TeacherForm key={t.id} teacher={t} isAdmin={isAdmin} compact onSubmit={(b) => save.mutateAsync(b)}>
          {isAdmin ? (
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button type="submit" size="sm" disabled={save.isPending}>
                Guardar
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => void deleteTeacher()}>
                Eliminar
              </Button>
            </div>
          ) : null}
        </TeacherForm>
        {isAdmin ? (
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Liquidación mensual</p>
            <TeacherPayoutPanel teacherId={teacherId} />
          </div>
        ) : null}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Historial</p>
          <TeacherPayoutHistory payouts={t.payouts ?? []} />
        </div>
      </div>
    </>
  );
}
