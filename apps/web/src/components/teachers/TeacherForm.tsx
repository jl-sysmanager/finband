import { useId, useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/utils";

export type TeacherPayoutSummary = {
  yearMonth: string;
  amount: number;
  baseAmount: number;
  transportAmount: number;
  workDays: number;
  amountPaid: number;
  status: string;
};

export type TeacherData = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  specialty?: string | null;
  hourlyRate: number;
  monthlySalary?: number | null;
  costPerClass?: number | null;
  weeklyHours?: number | null;
  transportCostPerDay: number;
  classGroups?: Array<{ name: string }>;
  payouts?: TeacherPayoutSummary[];
};

type FieldName = Exclude<keyof TeacherData, "id" | "classGroups" | "payouts">;

const FIELDS: Array<{ name: FieldName; label: string; type?: "number" | "email" | "tel" }> = [
  { name: "firstName", label: "Nombre" },
  { name: "lastName", label: "Apellidos" },
  { name: "phone", label: "Teléfono", type: "tel" },
  { name: "email", label: "Email", type: "email" },
  { name: "specialty", label: "Especialidad" },
  { name: "hourlyRate", label: "Precio por hora (€)", type: "number" },
  { name: "monthlySalary", label: "Salario mensual (€)", type: "number" },
  { name: "costPerClass", label: "Coste por clase (€)", type: "number" },
  { name: "weeklyHours", label: "Horas semanales", type: "number" },
  { name: "transportCostPerDay", label: "Transporte por jornada (€)", type: "number" },
];

/** Campos numéricos obligatorios en la API: vacíos valen 0, no null. */
const ZERO_WHEN_EMPTY = new Set<FieldName>(["hourlyRate", "transportCostPerDay"]);

/** Formulario de profesor compartido por la ficha y el panel lateral. */
export function TeacherForm({
  formId,
  teacher,
  isAdmin,
  compact,
  onSubmit,
  children,
}: {
  formId?: string;
  teacher?: TeacherData;
  isAdmin: boolean;
  compact?: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>;
  children?: ReactNode;
}) {
  const uid = useId();
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const { name, type } of FIELDS) {
      const v = String(fd.get(name) ?? "").trim();
      if (type === "number") body[name] = v ? Number(v) : ZERO_WHEN_EMPTY.has(name) ? 0 : null;
      else body[name] = v || null;
    }
    try {
      await onSubmit(body);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar el profesor");
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4 text-sm">
      <div className={compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
        {FIELDS.map(({ name, label, type }) => (
          <div key={name} className="space-y-1">
            <Label htmlFor={`${uid}-${name}`}>{label}</Label>
            <Input
              id={`${uid}-${name}`}
              name={name}
              type={type ?? "text"}
              step={type === "number" ? (name === "weeklyHours" ? "0.5" : "0.01") : undefined}
              min={type === "number" ? 0 : undefined}
              required={name === "firstName" || name === "lastName"}
              defaultValue={(teacher?.[name] as string | number | null | undefined) ?? ""}
              disabled={!isAdmin}
            />
          </div>
        ))}
      </div>
      {saveError ? (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
      {children}
    </form>
  );
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "pendiente",
  PARTIAL: "parcial",
  PAID: "pagada",
};

export function TeacherPayoutHistory({ payouts }: { payouts: TeacherPayoutSummary[] }) {
  if (payouts.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin liquidaciones registradas.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {payouts.map((p) => (
        <li key={p.yearMonth} className="rounded-md bg-muted/30 px-2 py-1.5">
          {p.yearMonth}: {formatMoney(p.amountPaid)} / {formatMoney(p.amount)} (
          {STATUS_LABELS[p.status] ?? p.status})
          {p.transportAmount > 0 ? (
            <span className="block text-xs text-muted-foreground">
              Base {formatMoney(p.baseAmount)} + transporte {formatMoney(p.transportAmount)} (
              {p.workDays} jornadas)
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
