import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MonthSelect } from "@/components/form/MonthSelect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { currentYearMonth, formatMoney } from "@/lib/utils";
import { useState } from "react";

type Preview = {
  baseAmount: number;
  discountAmount: number;
  totalAmount: number;
  lineItems: Array<{ label: string; amount: number }>;
};

export function StudentFeeGeneratePanel({
  studentId,
  compact = false,
  onGenerated,
}: {
  studentId: string;
  compact?: boolean;
  onGenerated?: () => void;
}) {
  const qc = useQueryClient();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ["student-fee-preview", studentId],
    queryFn: () => api<Preview>(`/students/${studentId}/fee-preview`),
  });

  const generate = useMutation({
    mutationFn: () =>
      api<{ totalAmount: number; yearMonth: string }>(`/students/${studentId}/generate-fee`, {
        method: "POST",
        body: JSON.stringify({ yearMonth }),
      }),
    onSuccess: (data) => {
      setError(null);
      if (data.totalAmount <= 0) {
        setMessage("No hay importe de cuota para generar (revisa matrículas y tarifas).");
      } else {
        setMessage(`Cuota de ${data.yearMonth} generada: ${formatMoney(data.totalAmount)}`);
      }
      qc.invalidateQueries({ queryKey: ["student", studentId] });
      qc.invalidateQueries({ queryKey: ["student-fees"] });
      onGenerated?.();
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : "No se pudo generar la cuota");
    },
  });

  return (
    <div className={compact ? "space-y-3" : "space-y-4 rounded-lg border border-border bg-muted/20 p-4"}>
      {!compact ? <p className="text-sm font-medium">Generar cuota del mes</p> : null}
      {preview.isLoading ? (
        <p className="text-sm text-muted-foreground">Calculando vista previa…</p>
      ) : preview.data ? (
        <div className="text-sm">
          <p className="font-medium">Vista previa (tarifas actuales)</p>
          <p className="text-lg font-semibold">{formatMoney(preview.data.totalAmount)}</p>
          <ul className="mt-1 text-muted-foreground">
            {preview.data.lineItems.map((l, i) => (
              <li key={i}>
                {l.label}: {formatMoney(l.amount)}
              </li>
            ))}
          </ul>
          {preview.data.discountAmount > 0 ? (
            <p className="text-muted-foreground">
              Descuentos: −{formatMoney(preview.data.discountAmount)}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>Mes</Label>
          <MonthSelect className="min-w-[180px]" value={yearMonth} onChange={setYearMonth} />
        </div>
        <Button
          type="button"
          onClick={() => {
            setMessage(null);
            setError(null);
            generate.mutate();
          }}
          disabled={generate.isPending}
        >
          {generate.isPending ? "Generando…" : "Generar cuota"}
        </Button>
      </div>
      {message ? <p className="text-sm text-income">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
