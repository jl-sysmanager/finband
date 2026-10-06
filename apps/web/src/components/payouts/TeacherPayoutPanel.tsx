import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MonthSelect } from "@/components/form/MonthSelect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { buildQuery, currentYearMonth, formatMoney } from "@/lib/utils";
import { useState } from "react";

const BASIS_LABELS: Record<string, string> = {
  monthlySalary: "Salario mensual fijo",
  costPerClass: "Coste por sesión según horario",
  hourlyRate: "Horas del horario × €/hora",
  hourlyWeeklyEstimate: "Horas semanales × €/hora",
  none: "Sin importe base configurado",
};

type Calc = {
  baseAmount: number;
  transportAmount: number;
  workDays: number;
  amount: number;
  basis: string;
  sessionCount: number;
  totalHours: number;
};

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
      qc.invalidateQueries({ queryKey: ["teacher-payouts"] });
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
      <div className="space-y-1">
        <Label>Mes</Label>
        <MonthSelect className="min-w-[180px]" value={yearMonth} onChange={setYearMonth} />
      </div>
      {preview.isLoading ? (
        <p className="text-muted-foreground">Calculando…</p>
      ) : preview.data ? (
        <ul className="space-y-1 rounded-lg border border-border bg-muted/20 p-3">
          <li>
            <span className="text-muted-foreground">Criterio: </span>
            {BASIS_LABELS[preview.data.basis] ?? preview.data.basis}
          </li>
          <li>
            Sesiones: {preview.data.sessionCount} · Horas: {preview.data.totalHours.toFixed(1)} h
          </li>
          <li>Base: {formatMoney(preview.data.baseAmount)}</li>
          <li>
            Transporte ({preview.data.workDays} jornadas):{" "}
            {formatMoney(preview.data.transportAmount)}
          </li>
          <li className="font-semibold">Total: {formatMoney(preview.data.amount)}</li>
        </ul>
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
