import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { DetailPageLayout } from "@/components/layout/DetailPageLayout";
import { StudentForm, type StudentData } from "@/components/students/StudentForm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/hooks/useConfirm";
import { ApiError, api } from "@/lib/api";
import { invalidateFinanceQueries } from "@/lib/query-invalidation";
import { useAuth } from "@/stores/auth";
import { useSyncPageTitle } from "@/stores/page-title";
import { toast } from "@/stores/toast";

export function StudentDetailPage() {
  const { id } = useParams();
  const isNew = id === "nuevo";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { confirm, dialog: confirmDialog } = useConfirm();

  const student = useQuery({
    queryKey: ["student", id],
    queryFn: () => api<StudentData>(`/students/${id}`),
    enabled: !isNew && !!id,
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew
        ? api<{ id: string }>("/students", { method: "POST", body: JSON.stringify(body) })
        : api<{ id: string }>(`/students/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      void invalidateFinanceQueries(qc);
      if (isNew && data?.id) navigate(`/alumnos/${data.id}`);
      else toast("Alumno guardado", "success");
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/students/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void invalidateFinanceQueries(qc);
      navigate("/alumnos");
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "No se pudo dar de baja al alumno", "error"),
  });

  const s = student.data;
  const displayName = s ? `${s.firstName} ${s.lastName}`.trim() : null;
  useSyncPageTitle(isNew ? null : displayName);

  if (!isNew && student.isLoading) {
    return (
      <div className="page-container space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isNew && (student.isError || !s)) {
    return (
      <Alert variant="destructive" className="page-container">
        <AlertDescription>No se pudo cargar el alumno.</AlertDescription>
      </Alert>
    );
  }

  async function deleteStudent() {
    const ok = await confirm({
      title: "Dar de baja",
      description: "¿Dar de baja a este alumno?",
      confirmLabel: "Dar de baja",
      destructive: true,
    });
    if (ok) remove.mutate();
  }

  return (
    <>
      {confirmDialog}
      <DetailPageLayout
        backTo="/alumnos"
        title={isNew ? "Nuevo alumno" : displayName || "Alumno"}
        subtitle={
          s ? (
            <Badge variant={s.status === "ACTIVE" ? "success" : "secondary"}>
              {s.status === "ACTIVE" ? "Activo" : "Inactivo"}
            </Badge>
          ) : undefined
        }
        headerActions={
          !isNew && isAdmin ? (
            <Button variant="destructive" size="sm" onClick={() => void deleteStudent()}>
              Baja lógica
            </Button>
          ) : undefined
        }
        footerActions={
          isAdmin ? (
            <Button
              type="submit"
              form="student-form"
              disabled={save.isPending}
              className="w-full md:w-auto"
            >
              Guardar
            </Button>
          ) : undefined
        }
      >
        <Card>
          <CardContent className="pt-6">
            <StudentForm
              key={isNew ? "new" : id}
              formId="student-form"
              student={s}
              isAdmin={isAdmin}
              onSubmit={(body) => save.mutateAsync(body)}
            />
          </CardContent>
        </Card>
      </DetailPageLayout>
    </>
  );
}
