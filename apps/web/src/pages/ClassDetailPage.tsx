import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ClassEnrollments,
  ClassForm,
  ClassScheduleSummary,
  type ClassData,
} from "@/components/classes/ClassForm";
import { invalidateClassQueries } from "@/lib/query-invalidation";
import { DetailPageLayout } from "@/components/layout/DetailPageLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useSyncPageTitle } from "@/stores/page-title";
import { toast } from "@/stores/toast";

export function ClassDetailPage() {
  const { id } = useParams();
  const isNew = id === "nueva";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");

  const cls = useQuery({
    queryKey: ["class", id],
    queryFn: () => api<ClassData>(`/classes/${id}`),
    enabled: !isNew && !!id,
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew
        ? api<{ id: string }>("/classes", { method: "POST", body: JSON.stringify(body) })
        : api<{ id: string }>(`/classes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      invalidateClassQueries(qc, isNew ? undefined : id);
      if (isNew && data?.id) navigate(`/clases/${data.id}`);
      else toast("Clase guardada", "success");
    },
  });

  const c = cls.data;
  useSyncPageTitle(isNew ? null : (c?.name ?? null));

  if (!isNew && cls.isLoading) {
    return (
      <div className="page-container space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isNew && (cls.isError || !c)) {
    return (
      <Alert variant="destructive" className="page-container">
        <AlertDescription>No se pudo cargar la clase.</AlertDescription>
      </Alert>
    );
  }

  return (
    <DetailPageLayout
      backTo="/clases"
      title={isNew ? "Nueva clase" : (c?.name ?? "Clase")}
      footerActions={
        isAdmin ? (
          <Button type="submit" form="class-form" disabled={save.isPending} className="w-full md:w-auto">
            Guardar
          </Button>
        ) : undefined
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Configuración de la clase</CardTitle>
        </CardHeader>
        <CardContent>
          <ClassForm
            key={isNew ? "new" : id}
            formId="class-form"
            cls={c}
            isAdmin={isAdmin}
            onSubmit={(body) => save.mutateAsync(body)}
          />
        </CardContent>
      </Card>

      {c && (c.scheduleSlots?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Resumen horario</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ClassScheduleSummary slots={c.scheduleSlots ?? []} />
          </CardContent>
        </Card>
      ) : null}

      {c ? (
        <Card>
          <CardHeader>
            <CardTitle>Alumnos inscritos</CardTitle>
          </CardHeader>
          <CardContent>
            <ClassEnrollments classId={c.id} enrollments={c.enrollments ?? []} isAdmin={isAdmin} />
          </CardContent>
        </Card>
      ) : null}
    </DetailPageLayout>
  );
}
