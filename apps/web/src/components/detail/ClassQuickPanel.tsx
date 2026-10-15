import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClassEnrollments,
  ClassForm,
  ClassScheduleSummary,
  type ClassData,
} from "@/components/classes/ClassForm";
import { invalidateClassQueries } from "@/lib/query-invalidation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useConfirm } from "@/hooks/useConfirm";
import { toast } from "@/stores/toast";

type Props = {
  classId: string;
  onRemoved?: () => void;
};

export function ClassQuickPanel({ classId, onRemoved }: Props) {
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { confirm, dialog: confirmDialog } = useConfirm();

  const cls = useQuery({
    queryKey: ["class", classId],
    queryFn: () => api<ClassData>(`/classes/${classId}`),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/classes/${classId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidateClassQueries(qc, classId);
      toast("Clase guardada", "success");
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/classes/${classId}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateClassQueries(qc);
      onRemoved?.();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "No se pudo eliminar", "error"),
  });

  if (cls.isLoading) return <Skeleton className="h-48 w-full" />;
  if (!cls.data) return <p className="text-sm text-muted-foreground">No se pudo cargar.</p>;
  const c = cls.data;

  async function deleteClass() {
    const ok = await confirm({
      title: "Eliminar clase",
      description: `¿Eliminar «${c.name}»? Se darán de baja sus matrículas; las liquidaciones ya trabajadas no cambian.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) remove.mutate();
  }

  return (
    <>
      {confirmDialog}
      <div className="space-y-4">
        <ClassForm
          key={c.id}
          cls={c}
          isAdmin={isAdmin}
          compact
          onSubmit={(body) => save.mutateAsync(body)}
        >
          {isAdmin ? (
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button type="submit" size="sm" disabled={save.isPending}>
                Guardar
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => void deleteClass()}>
                Eliminar clase
              </Button>
            </div>
          ) : null}
        </ClassForm>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Alumnos inscritos</p>
          <ClassEnrollments classId={c.id} enrollments={c.enrollments ?? []} isAdmin={isAdmin} />
        </div>
        {(c.scheduleSlots?.length ?? 0) > 0 ? (
          <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
            <ClassScheduleSummary slots={c.scheduleSlots ?? []} />
          </div>
        ) : null}
      </div>
    </>
  );
}
