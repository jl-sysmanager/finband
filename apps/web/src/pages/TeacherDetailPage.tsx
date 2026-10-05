import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

export function TeacherDetailPage() {
  const { id } = useParams();
  const isNew = id === "nuevo";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");

  const teacher = useQuery({
    queryKey: ["teacher", id],
    queryFn: () => api<Record<string, unknown>>(`/teachers/${id}`),
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
    payouts?: Array<{ yearMonth: string; amount: number; amountPaid: number; status: string }>;
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      if (["hourlyRate", "monthlySalary", "costPerClass", "weeklyHours"].includes(k)) {
        body[k] = v ? Number(v) : null;
      } else body[k] = v || null;
    });
    await save.mutateAsync(body);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">
        {isNew ? "Nuevo profesor" : `${t?.firstName ?? ""} ${t?.lastName ?? ""}`}
      </h1>
      <form onSubmit={onSubmit} className="space-y-4">
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
        {!isNew && t?.payouts ? (
          <Card>
            <CardHeader>
              <CardTitle>Liquidaciones</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {t.payouts.map((p, i) => (
                  <li key={i}>
                    {p.yearMonth}: {formatMoney(p.amountPaid)} / {formatMoney(p.amount)} ({p.status})
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
        {isAdmin ? (
          <Button type="submit" disabled={save.isPending}>
            Guardar
          </Button>
        ) : null}
      </form>
    </div>
  );
}
