import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { MonthSelect } from "@/components/form/MonthSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { buildQuery, currentYearMonth, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useSyncPageTitle } from "@/stores/page-title";
import { DetailPageLayout } from "@/components/layout/DetailPageLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

export function TeacherDetailPage() {
  const { id } = useParams();
  const isNew = id === "nuevo";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewMonth, setPreviewMonth] = useState(currentYearMonth());

  const PAYOUT_BASIS_LABELS: Record<string, string> = {
    monthlySalary: "Salario mensual fijo",
    costPerClass: "Coste por sesión según clases y horario",
    hourlyRate: "Horas impartidas según horario × €/hora",
    hourlyWeeklyEstimate: "Horas semanales configuradas × €/hora",
    none: "Sin importe base (revisar tarifas del profesor)",
  };

  const teacher = useQuery({
    queryKey: ["teacher", id],
    queryFn: () => api<Record<string, unknown>>(`/teachers/${id}`),
    enabled: !isNew && !!id,
  });

  const payoutPreview = useQuery({
    queryKey: ["payout-calc", id, previewMonth],
    queryFn: () =>
      api<{
        baseAmount: number;
        transportAmount: number;
        workDays: number;
        amount: number;
        basis: string;
        sessionCount: number;
        totalHours: number;
      }>(
        `/payments/teacher-payouts/calculate${buildQuery({
          teacherId: id,
          yearMonth: previewMonth,
        })}`,
      ),
    enabled: !isNew && !!id,
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew
        ? api<{ id: string }>("/teachers", { method: "POST", body: JSON.stringify(body) })
        : api<{ id: string }>(`/teachers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (data: { id?: string }) => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
      if (isNew && data?.id) navigate(`/profesores/${data.id}`);
      else qc.invalidateQueries({ queryKey: ["teacher", id] });
    },
  });

  const t = teacher.data as {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    specialty?: string;
    hourlyRate?: number;
    monthlySalary?: number;
    costPerClass?: number;
    weeklyHours?: number;
    classGroups?: Array<{ name: string }>;
    transportCostPerDay?: number;
    payouts?: Array<{
      yearMonth: string;
      amount: number;
      baseAmount: number;
      transportAmount: number;
      workDays: number;
      amountPaid: number;
      status: string;
    }>;
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      if (
        ["hourlyRate", "monthlySalary", "costPerClass", "weeklyHours", "transportCostPerDay"].includes(
          k,
        )
      ) {
        body[k] = v ? Number(v) : k === "transportCostPerDay" ? 0 : null;
      } else body[k] = v || null;
    });
    try {
      await save.mutateAsync(body);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar el profesor");
    }
  }

  const displayName = isNew ? null : `${t?.firstName ?? ""} ${t?.lastName ?? ""}`.trim();
  useSyncPageTitle(displayName || null);

  if (!isNew && teacher.isLoading) {
    return (
      <div className="page-container space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isNew && teacher.isError) {
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
      <form id="teacher-form" key={isNew ? "new" : id} onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Datos personales y económicos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {[
              ["firstName", "Nombre"],
              ["lastName", "Apellidos"],
              ["phone", "Teléfono"],
              ["email", "Email"],
              ["specialty", "Especialidad"],
              ["hourlyRate", "Precio por hora", "number"],
              ["monthlySalary", "Salario mensual", "number"],
              ["costPerClass", "Coste por clase", "number"],
              ["weeklyHours", "Horas semanales", "number"],
              ["transportCostPerDay", "Transporte por jornada (€)", "number"],
            ].map(([name, label, type]) => (
              <div key={name} className="space-y-1">
                <Label>{label}</Label>
                <Input
                  name={name}
                  type={type ?? "text"}
                  defaultValue={(t?.[name as keyof typeof t] as string | number | undefined) ?? ""}
                  disabled={!isAdmin}
                />
              </div>
            ))}
          </CardContent>
        </Card>
        {!isNew ? (
          <Card>
            <CardHeader>
              <CardTitle>Cálculo de liquidación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Se usa, por este orden, el primer importe configurado en la ficha: salario mensual,
                coste por clase (sesiones del mes según horario), o precio por hora (horas del
                horario). El transporte se suma por jornadas con clase ese mes.
              </p>
              <div className="max-w-xs space-y-1">
                <Label>Mes a simular</Label>
                <MonthSelect value={previewMonth} onChange={setPreviewMonth} />
              </div>
              {payoutPreview.data ? (
                <ul className="space-y-1 rounded-lg border border-border p-3">
                  <li>
                    <span className="text-muted-foreground">Criterio: </span>
                    {PAYOUT_BASIS_LABELS[payoutPreview.data.basis] ?? payoutPreview.data.basis}
                  </li>
                  <li>
                    Sesiones en el mes: {payoutPreview.data.sessionCount} · Horas:{" "}
                    {payoutPreview.data.totalHours.toFixed(1)} h
                  </li>
                  <li>Base: {formatMoney(payoutPreview.data.baseAmount)}</li>
                  <li>
                    Transporte ({payoutPreview.data.workDays} jornadas):{" "}
                    {formatMoney(payoutPreview.data.transportAmount)}
                  </li>
                  <li className="font-medium">
                    Total liquidación: {formatMoney(payoutPreview.data.amount)}
                  </li>
                </ul>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {!isNew && t?.payouts ? (
          <Card>
            <CardHeader>
              <CardTitle>Liquidaciones registradas</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {t.payouts.map((p, i) => (
                  <li key={i}>
                    {p.yearMonth}: {formatMoney(p.amountPaid)} / {formatMoney(p.amount)} ({p.status})
                    {p.transportAmount > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        Base {formatMoney(p.baseAmount)} + transporte {formatMoney(p.transportAmount)}{" "}
                        ({p.workDays} jornadas)
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
        {saveError ? (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </DetailPageLayout>
  );
}
