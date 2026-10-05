import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { FEE_STATUS_LABELS } from "@finband/shared";
import { Trash2 } from "lucide-react";
import { useState } from "react";

export function StudentDetailPage() {
  const { id } = useParams();
  const isNew = id === "nuevo";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const [tab, setTab] = useState<"personal" | "academico" | "economico">("personal");
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

  function fieldDefault(name: string) {
    const raw = s?.[name as keyof typeof s];
    if (name === "birthDate" && typeof raw === "string") return raw.slice(0, 10);
    return (raw as string | number | undefined) ?? "";
  }

  function field(name: string, label: string, type = "text") {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <Input
          name={name}
          type={type}
          defaultValue={fieldDefault(name)}
          disabled={!isAdmin}
        />
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
    return <p className="text-muted-foreground">Cargando alumno…</p>;
  }

  if (!isNew && student.isError) {
    return <p className="text-destructive">No se pudo cargar el alumno.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {isNew ? "Nuevo alumno" : `${s?.firstName ?? ""} ${s?.lastName ?? ""}`}
        </h1>
        {!isNew && isAdmin ? (
          <Button variant="destructive" onClick={() => remove.mutate()}>
            Baja lógica
          </Button>
        ) : null}
      </div>

      <div className="flex gap-2">
        {(["personal", "academico", "economico"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? "default" : "outline"}
            onClick={() => setTab(t)}
          >
            {t === "personal" ? "Personal" : t === "academico" ? "Académico" : "Económico"}
          </Button>
        ))}
      </div>

      <form key={isNew ? "new" : id} onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Ficha del alumno</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {tab === "personal" ? (
              <>
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
              </>
            ) : null}
            {tab === "academico" ? (
              <>
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
              </>
            ) : null}
            {tab === "economico" ? (
              <>
                {field("monthlyFee", "Cuota mensual fija (opcional)", "number")}
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
                            <th>Mes</th>
                            <th>Total</th>
                            <th>Pagado</th>
                            <th>Estado</th>
                            {isAdmin ? <th className="w-10" /> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {(s?.fees ?? []).map((f) => (
                            <tr key={f.id}>
                              <td className="py-1">{f.yearMonth}</td>
                              <td>{formatMoney(f.totalAmount)}</td>
                              <td>{formatMoney(f.amountPaid)}</td>
                              <td>{FEE_STATUS_LABELS[f.status]}</td>
                              {isAdmin ? (
                                <td className="py-1 text-right">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Eliminar cuota"
                                    onClick={() => {
                                      if (confirm("¿Eliminar esta cuota? Se borrarán también los cobros asociados.")) {
                                        deleteFee.mutate(f.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-expense" />
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
              </>
            ) : null}
          </CardContent>
        </Card>
        {saveError ? <p className="mt-4 text-sm text-destructive">{saveError}</p> : null}
        {isAdmin ? (
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={save.isPending}>
              Guardar
            </Button>
          </div>
        ) : null}
      </form>
      {!isNew && s?.birthDate ? (
        <p className="text-xs text-muted-foreground">Nacimiento: {formatDate(s.birthDate)}</p>
      ) : null}
    </div>
  );
}
