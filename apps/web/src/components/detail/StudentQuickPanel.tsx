import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StudentForm, type StudentData } from "@/components/students/StudentForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/hooks/useConfirm";
import { ApiError, api } from "@/lib/api";
import { invalidateFinanceQueries } from "@/lib/query-invalidation";
import { useAuth } from "@/stores/auth";
import { toast } from "@/stores/toast";

type Props = {
  studentId: string;
  onRemoved?: () => void;
};

export function StudentQuickPanel({ studentId, onRemoved }: Props) {
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { confirm, dialog: confirmDialog } = useConfirm();

  const student = useQuery({
    queryKey: ["student", studentId],
    queryFn: () => api<StudentData>(`/students/${studentId}`),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/students/${studentId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      void invalidateFinanceQueries(qc);
      toast("Alumno guardado", "success");
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/students/${studentId}`, { method: "DELETE" }),
    onSuccess: () => {
      void invalidateFinanceQueries(qc);
      onRemoved?.();
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "No se pudo dar de baja", "error"),
  });

  if (student.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!student.data) return <p className="text-sm text-muted-foreground">No se pudo cargar.</p>;
  const s = student.data;

  async function deleteStudent() {
    const ok = await confirm({
      title: "Dar de baja",
      description: `¿Dar de baja a ${s.firstName} ${s.lastName}?`,
      confirmLabel: "Dar de baja",
      destructive: true,
    });
    if (ok) remove.mutate();
  }

  return (
    <>
      {confirmDialog}
      <StudentForm
        key={s.id}
        student={s}
        isAdmin={isAdmin}
        compact
        onSubmit={(body) => save.mutateAsync(body)}
      >
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Badge variant={s.status === "ACTIVE" ? "success" : "secondary"}>
            {s.status === "ACTIVE" ? "Activo" : "Inactivo"}
          </Badge>
          {isAdmin ? (
            <>
              <Button type="submit" size="sm" disabled={save.isPending}>
                Guardar
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => void deleteStudent()}>
                Dar de baja
              </Button>
            </>
          ) : null}
        </div>
      </StudentForm>
    </>
  );
}
