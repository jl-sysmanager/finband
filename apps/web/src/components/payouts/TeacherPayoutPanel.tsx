import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MonthSelect } from "@/components/form/MonthSelect";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/form/Field";
import { ApiError, api } from "@/lib/api";
import { invalidateFinanceQueries } from "@/lib/query-invalidation";
import { buildQuery, currentYearMonth, formatMoney } from "@/lib/utils";
import { useState } from "react";
import { PAY_METHOD_LABELS, PAY_RATE_UNITS, type PayMethod } from "@finband/shared";

type Calc = {
  payMethod: PayMethod;
  payRate: number;
  baseAmount: number;
  transportAmount: number;
  workDays: number;
  amount: number;
  sessionCount: number;
  totalMinutes: number;
  classes: Array<{ classId: string; name: string; sessions: number; minutes: number; amount: number | null }>;
  warnings: string[];
};

const hours = (minutes: number) =>
  `${(minutes / 60).toLocaleString("es-ES", { maximumFractionDigits: 2 })} h`;

export function TeacherPayoutPanel({
  teacherId,
  onGenerated,
}: {
  teacherId: string;
  onGenerated?: () => void;
}) {
  const qc = useQueryClient();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ["teacher-payout-preview", teacherId, yearMonth],
    queryFn: () =>
      api<Calc>(
        `/payments/teacher-payouts/calculate${buildQuery({ teacherId, yearMonth })}`,
      ),
  });

  const generate = useMutation({
    mutationFn: () =>
      api<{ generated: number; yearMonth: string; amount?: number }>(
        "/payments/teacher-payouts/generate",
        {
          method: "POST",
          body: JSON.stringify({ yearMonth, teacherId }),
        },
      ),
    onSuccess: (data) => {
      setError(null);
      if (data.generated === 0) {
        setMessage("No hay importe de liquidación para ese mes.");
      } else {
        setMessage(
          `Liquidación ${data.yearMonth} registrada${data.amount != null ? `: ${formatMoney(data.amount)}` : ""}.`,
        );
      }
      invalidateFinanceQueries(qc);
      qc.invalidateQueries({ queryKey: ["teacher", teacherId] });
      onGenerated?.();
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : "No se pudo generar la liquidación");
    },
  });

  return (
    <div className="space-y-3 text-sm">
      <Field label="Mes">
        <MonthSelect className="min-w-[180px]" value={yearMonth} onChange={setYearMonth} />
      </Field>
      {preview.isLoading ? (
        <p className="text-muted-foreground">Calculando…</p>
      ) : preview.data ? (
        <PayoutBreakdown calc={preview.data} />
      ) : preview.isError ? (
        <p className="text-destructive">No se pudo calcular la liquidación.</p>
      ) : null}
      <Button
        type="button"
        size="sm"
        disabled={generate.isPending}
        onClick={() => {
          setMessage(null);
          setError(null);
          generate.mutate();
        }}
      >
        {generate.isPending ? "Guardando…" : "Registrar liquidación"}
      </Button>
      {message ? <p className="text-sm text-income">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

/** Desglose de la liquidación: método, clases del horario, transporte y avisos. */
function PayoutBreakdown({ calc }: { calc: Calc }) {
  const unit = PAY_RATE_UNITS[calc.payMethod];
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <p>
        <span className="text-muted-foreground">Método: </span>
        {PAY_METHOD_LABELS[calc.payMethod]} · {formatMoney(calc.payRate)} {unit.replace("€", "").trim()}
      </p>
      {calc.classes.length > 0 ? (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-medium">Clase</th>
              <th className="py-1 text-right font-medium">Sesiones</th>
              <th className="py-1 text-right font-medium">Horas</th>
              {calc.payMethod !== "MONTHLY_SALARY" ? (
                <th className="py-1 text-right font-medium">Importe</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {calc.classes.map((c) => (
              <tr key={c.classId} className="border-t border-border/60">
                <td className="py-1">{c.name}</td>
                <td className="py-1 text-right tabular-nums">{c.sessions}</td>
                <td className="py-1 text-right tabular-nums">{hours(c.minutes)}</td>
                {c.amount !== null ? (
                  <td className="py-1 text-right tabular-nums">{formatMoney(c.amount)}</td>
                ) : null}
              </tr>
            ))}
            <tr className="border-t border-border font-medium">
              <td className="py-1">Total</td>
              <td className="py-1 text-right tabular-nums">{calc.sessionCount}</td>
              <td className="py-1 text-right tabular-nums">{hours(calc.totalMinutes)}</td>
              {calc.payMethod !== "MONTHLY_SALARY" ? (
                <td className="py-1 text-right tabular-nums">{formatMoney(calc.baseAmount)}</td>
              ) : null}
            </tr>
          </tbody>
        </table>
      ) : null}
      <ul className="space-y-0.5">
        <li>Base: {formatMoney(calc.baseAmount)}</li>
        <li>
          Transporte ({calc.workDays} {calc.workDays === 1 ? "jornada" : "jornadas"}):{" "}
          {formatMoney(calc.transportAmount)}
        </li>
        <li className="font-semibold">Total: {formatMoney(calc.amount)}</li>
      </ul>
      {calc.warnings.map((w) => (
        <p key={w} className="text-xs font-medium text-warning">
          ⚠ {w}
        </p>
      ))}
    </div>
  );
}
