import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { DetailPageLayout } from "@/components/layout/DetailPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useSyncPageTitle } from "@/stores/page-title";
import { FEE_STATUS_LABELS } from "@finband/shared";
import { StudentFeeGeneratePanel } from "@/components/fees/StudentFeeGeneratePanel";
import { Trash2 } from "lucide-react";
import { useState } from "react";

export function StudentDetailPage() {
  const { id } = useParams();
  const isNew = id === "nuevo";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const [tab, setTab] = useState("personal");
  const [saveError, setSaveError] = useState<string | null>(null);

  const student = useQuery({
    queryKey: ["student", id],
    queryFn: () => api<Record<string, unknown>>(`/students/${id}`),
    enabled: !isNew && !!id,
  });

  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => api<Array<{ id: string; firstName: string; lastName: string }>>("/teachers"),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew
        ? api<{ id: string }>("/students", { method: "POST", body: JSON.stringify(body) })
        : api<{ id: string }>(`/students/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (data: { id?: string }) => {
      qc.invalidateQueries({ queryKey: ["students"] });
      if (isNew && data?.id) navigate(`/alumnos/${data.id}`);
      else qc.invalidateQueries({ queryKey: ["student", id] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/students/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      navigate("/alumnos");
    },
  });

  const deleteFee = useMutation({
    mutationFn: (feeId: string) => api(`/payments/student-fees/${feeId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student", id] }),
  });

  const s = student.data as {
    firstName?: string;
    lastName?: string;
    birthDate?: string;
    phone?: string;
    email?: string;
    address?: string;
    legalGuardian?: string;
    notes?: string;
    mainInstrument?: string;
    level?: string;
    primaryTeacherId?: string;
    monthlyFee?: number;
    status?: string;
    enrollments?: Array<{ classGroup: { name: string; teacher: { firstName: string; lastName: string } } }>;
    fees?: Array<{ id: string; yearMonth: string; totalAmount: number; amountPaid: number; status: keyof typeof FEE_STATUS_LABELS }>;
    discounts?: Array<{ id: string; name: string; type: string; value: number }>;
  };

  const displayName = isNew ? null : `${s?.firstName ?? ""} ${s?.lastName ?? ""}`.trim();
  useSyncPageTitle(displayName || null);

  function fieldDefault(name: string) {
    const raw = s?.[name as keyof typeof s];
    if (name === "birthDate" && typeof raw === "string") return raw.slice(0, 10);
    return (raw as string | number | undefined) ?? "";
  }

  function field(name: string, label: string, type = "text") {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <Input name={name} type={type} defaultValue={fieldDefault(name)} disabled={!isAdmin} />
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      if (k === "monthlyFee") body[k] = v ? Number(v) : null;
      else body[k] = v || null;
    });
    if (!body.status) body.status = "ACTIVE";
    try {
      await save.mutateAsync(body);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar el alumno");
    }
  }

  if (!isNew && student.isLoading) {
    return (
      <div className="page-container space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isNew && student.isError) {
    return (
      <Alert variant="destructive" className="page-container">
        <AlertDescription>No se pudo cargar el alumno.</AlertDescription>
      </Alert>
    );
  }

  return (
    <DetailPageLayout
      backTo="/alumnos"
      title={isNew ? "Nuevo alumno" : displayName || "Alumno"}
      subtitle={
        !isNew && s?.status ? (
          <Badge variant={s.status === "ACTIVE" ? "success" : "secondary"}>
            {s.status === "ACTIVE" ? "Activo" : "Inactivo"}
          </Badge>
        ) : undefined
      }
      headerActions={
        !isNew && isAdmin ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm("¿Dar de baja a este alumno?")) remove.mutate();
            }}
          >
            Baja lógica
          </Button>
        ) : undefined
      }
      footerActions={
        isAdmin ? (
          <Button type="submit" form="student-form" disabled={save.isPending} className="w-full md:w-auto">
            Guardar
          </Button>
        ) : undefined
      }
    >
      <form id="student-form" key={isNew ? "new" : id} onSubmit={onSubmit}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="academico">Académico</TabsTrigger>
            <TabsTrigger value="economico">Económico</TabsTrigger>
          </TabsList>
          <TabsContent value="personal">
            <Card>
              <CardHeader>
                <CardTitle>Datos personales</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {field("firstName", "Nombre")}
                {field("lastName", "Apellidos")}
                {field("birthDate", "Fecha de nacimiento", "date")}
                {field("phone", "Teléfono")}
                {field("email", "Email")}
                {field("address", "Dirección")}
                {field("legalGuardian", "Tutor legal")}
                <div className="md:col-span-2 space-y-1">
                  <Label>Observaciones</Label>
                  <Input name="notes" defaultValue={s?.notes ?? ""} disabled={!isAdmin} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="academico">
            <Card>
              <CardHeader>
                <CardTitle>Académico</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {field("mainInstrument", "Instrumento principal")}
                {field("level", "Nivel")}
                <div className="space-y-1">
                  <Label>Profesor asignado</Label>
                  <select
                    name="primaryTeacherId"
                    defaultValue={s?.primaryTeacherId ?? ""}
                    disabled={!isAdmin}
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                  >
                    <option value="">—</option>
                    {teachers.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName}
                      </option>
                    ))}
                  </select>
                </div>
                {!isNew ? (
                  <div className="md:col-span-2">
                    <p className="mb-2 text-sm font-medium">Clases matriculadas</p>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {(s?.enrollments ?? []).map((e, i) => (
                        <li key={i}>
                          {e.classGroup.name} — Prof. {e.classGroup.teacher.firstName}{" "}
                          {e.classGroup.teacher.lastName}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="economico">
            <Card>
              <CardHeader>
                <CardTitle>Económico</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {field("monthlyFee", "Cuota mensual fija (opcional)", "number")}
                {!isNew && isAdmin && id ? (
                  <div className="md:col-span-2">
                    <StudentFeeGeneratePanel studentId={id} />
                  </div>
                ) : null}
                {!isNew ? (
                  <>
                    <div className="md:col-span-2">
                      <p className="mb-2 text-sm font-medium">Descuentos / becas</p>
                      <ul className="text-sm">
                        {(s?.discounts ?? []).map((d) => (
                          <li key={d.id}>
                            {d.name}: {d.type === "PERCENT" ? `${d.value}%` : formatMoney(d.value)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="md:col-span-2 overflow-x-auto">
                      <p className="mb-2 text-sm font-medium">Historial de cuotas</p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="pb-2">Mes</th>
                            <th className="pb-2">Total</th>
                            <th className="pb-2">Pagado</th>
                            <th className="pb-2">Estado</th>
                            {isAdmin ? <th className="w-10" /> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {(s?.fees ?? []).map((f) => (
                            <tr key={f.id} className="border-t border-border/60">
                              <td className="py-2">{f.yearMonth}</td>
                              <td>{formatMoney(f.totalAmount)}</td>
                              <td>{formatMoney(f.amountPaid)}</td>
                              <td>{FEE_STATUS_LABELS[f.status]}</td>
                              {isAdmin ? (
                                <td className="text-right">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Eliminar cuota"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          "¿Eliminar esta cuota? Se borrarán también los cobros asociados.",
                                        )
                                      ) {
                                        deleteFee.mutate(f.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        {saveError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </DetailPageLayout>
  );
}
