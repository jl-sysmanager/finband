import { PAY_METHOD_LABELS, PAY_METHODS, PAY_RATE_UNITS, type PayMethod } from "@finband/shared";
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
  payMethod: PayMethod;
  payRate: number;
  transportCostPerDay: number;
  classGroups?: Array<{ name: string }>;
  payouts?: TeacherPayoutSummary[];
};

type FieldName = "firstName" | "lastName" | "phone" | "email" | "specialty";

const FIELDS: Array<{ name: FieldName; label: string; type?: "email" | "tel" }> = [
  { name: "firstName", label: "Nombre" },
  { name: "lastName", label: "Apellidos" },
  { name: "phone", label: "Teléfono", type: "tel" },
  { name: "email", label: "Email", type: "email" },
  { name: "specialty", label: "Especialidad" },
];

const METHOD_HELP: Record<PayMethod, string> = {
  MONTHLY_SALARY: "Importe fijo cada mes, con independencia de las clases.",
  HOURLY: "Se multiplica por las horas de sus clases en el horario del mes.",
  PER_CLASS: "Se multiplica por las sesiones de sus clases en el horario del mes.",
};

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
  const [payMethod, setPayMethod] = useState<PayMethod>(teacher?.payMethod ?? "HOURLY");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const { name } of FIELDS) {
      body[name] = String(fd.get(name) ?? "").trim() || null;
    }
    body.payMethod = payMethod;
    body.payRate = Number(fd.get("payRate") || 0);
    body.transportCostPerDay = Number(fd.get("transportCostPerDay") || 0);
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
              required={name === "firstName" || name === "lastName"}
              defaultValue={teacher?.[name] ?? ""}
              disabled={!isAdmin}
            />
          </div>
        ))}
      </div>

      <fieldset className="space-y-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium">Honorarios</legend>
        <div role="radiogroup" aria-label="Método de cálculo" className="grid gap-2 sm:grid-cols-3">
          {PAY_METHODS.map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                payMethod === m ? "border-primary bg-primary/5 font-medium" : "border-border"
              } ${!isAdmin ? "cursor-default opacity-70" : ""}`}
            >
              <input
                type="radio"
                name="payMethod"
                value={m}
                checked={payMethod === m}
                disabled={!isAdmin}
                onChange={() => setPayMethod(m)}
                className="accent-primary"
              />
              {PAY_METHOD_LABELS[m]}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{METHOD_HELP[payMethod]}</p>
        <div className={compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-payRate`}>
              {PAY_METHOD_LABELS[payMethod]} ({PAY_RATE_UNITS[payMethod]})
            </Label>
            <Input
              id={`${uid}-payRate`}
              name="payRate"
              type="number"
              step="0.01"
              min={0}
              required
              defaultValue={teacher?.payRate ?? ""}
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-transportCostPerDay`}>Transporte por jornada (€)</Label>
            <Input
              id={`${uid}-transportCostPerDay`}
              name="transportCostPerDay"
              type="number"
              step="0.01"
              min={0}
              defaultValue={teacher?.transportCostPerDay ?? ""}
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">Por cada día del mes con alguna clase.</p>
          </div>
        </div>
      </fieldset>
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
