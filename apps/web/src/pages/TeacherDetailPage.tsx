import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { DetailPageLayout } from "@/components/layout/DetailPageLayout";
import { TeacherPayoutPanel } from "@/components/payouts/TeacherPayoutPanel";
import {
  TeacherForm,
  TeacherPayoutHistory,
  type TeacherData,
} from "@/components/teachers/TeacherForm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { invalidateTeacherQueries } from "@/lib/query-invalidation";
import { useAuth } from "@/stores/auth";
import { useSyncPageTitle } from "@/stores/page-title";
import { toast } from "@/stores/toast";

export function TeacherDetailPage() {
  const { id } = useParams();
  const isNew = id === "nuevo";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");

  const teacher = useQuery({
    queryKey: ["teacher", id],
    queryFn: () => api<TeacherData>(`/teachers/${id}`),
    enabled: !isNew && !!id,
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew
        ? api<{ id: string }>("/teachers", { method: "POST", body: JSON.stringify(body) })
        : api<{ id: string }>(`/teachers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      invalidateTeacherQueries(qc, isNew ? undefined : id);
      if (isNew && data?.id) navigate(`/profesores/${data.id}`);
      else toast("Profesor guardado", "success");
    },
  });

  const t = teacher.data;
  const displayName = t ? `${t.firstName} ${t.lastName}`.trim() : null;
  useSyncPageTitle(isNew ? null : displayName);

  if (!isNew && teacher.isLoading) {
    return (
      <div className="page-container space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isNew && (teacher.isError || !t)) {
    return (
      <Alert variant="destructive" className="page-container">
        <AlertDescription>No se pudo cargar el profesor.</AlertDescription>
      </Alert>
    );
  }

  return (
    <DetailPageLayout
      backTo="/profesores"
      title={isNew ? "Nuevo profesor" : displayName || "Profesor"}
      footerActions={
        isAdmin ? (
          <Button type="submit" form="teacher-form" disabled={save.isPending} className="w-full md:w-auto">
            Guardar
          </Button>
        ) : undefined
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Datos personales y económicos</CardTitle>
        </CardHeader>
        <CardContent>
          <TeacherForm
            key={isNew ? "new" : id}
            formId="teacher-form"
            teacher={t}
            isAdmin={isAdmin}
            onSubmit={(body) => save.mutateAsync(body)}
          />
        </CardContent>
      </Card>
      {t && isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Liquidación mensual</CardTitle>
          </CardHeader>
          <CardContent>
            <TeacherPayoutPanel teacherId={t.id} />
          </CardContent>
        </Card>
      ) : null}
      {t ? (
        <Card>
          <CardHeader>
            <CardTitle>Liquidaciones registradas</CardTitle>
          </CardHeader>
          <CardContent>
            <TeacherPayoutHistory payouts={t.payouts ?? []} />
          </CardContent>
        </Card>
      ) : null}
    </DetailPageLayout>
  );
}
