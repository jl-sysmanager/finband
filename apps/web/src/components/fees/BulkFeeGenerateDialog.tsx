import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MonthSelect } from "@/components/form/MonthSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { toast } from "@/stores/toast";
import { currentYearMonth, formatMoney } from "@/lib/utils";

type PreviewRow = {
  studentId: string;
  studentName: string;
  totalAmount: number;
  issue: "ready" | "no_amount" | "has_payments" | "excluded";
  existingFeeId: string | null;
  amountPaid: number;
};

type Preview = {
  yearMonth: string;
  rows: PreviewRow[];
  summary: {
    activeStudents: number;
    eligible: number;
    skippedNoAmount: number;
    skippedHasPayments: number;
    totalEligibleAmount: number;
  };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMonth?: string;
};

export function BulkFeeGenerateDialog({ open, onOpenChange, defaultMonth }: Props) {
  const qc = useQueryClient();
  const [yearMonth, setYearMonth] = useState(defaultMonth ?? currentYearMonth());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ["bulk-fee-preview", yearMonth],
    queryFn: () =>
      api<Preview>("/tariffs/generate-month/preview", {
        method: "POST",
        body: JSON.stringify({ yearMonth }),
      }),
    enabled: open,
  });

  const eligibleRows = useMemo(
    () => (preview.data?.rows ?? []).filter((r) => r.issue === "ready" && r.totalAmount > 0),
    [preview.data?.rows],
  );

  const generate = useMutation({
    mutationFn: () =>
      api<{ generated: number; skipped: number; yearMonth: string }>("/tariffs/generate-month", {
        method: "POST",
        body: JSON.stringify({
          yearMonth,
          excludeStudentIds: [...excluded],
        }),
      }),
    onSuccess: (data) => {
      setError(null);
      const msg = `Cuotas generadas/actualizadas: ${data.generated}. Omitidos: ${data.skipped}.`;
      setMessage(msg);
      toast(msg, "success");
      qc.invalidateQueries({ queryKey: ["student-fees"] });
      qc.invalidateQueries({ queryKey: ["dashboard-action-items"] });
      qc.invalidateQueries({ queryKey: ["bulk-fee-preview"] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : "No se pudo generar las cuotas");
    },
  });

  function toggleStudent(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const toGenerate = eligibleRows.filter((r) => !excluded.has(r.studentId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Generación masiva de cuotas</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Mes</Label>
            <MonthSelect value={yearMonth} onChange={setYearMonth} />
          </div>
          {preview.data?.summary ? (
            <p className="text-sm text-muted-foreground">
              {preview.data.summary.eligible} alumnos ·{" "}
              {formatMoney(preview.data.summary.totalEligibleAmount)} en total ·{" "}
              {preview.data.summary.skippedHasPayments} con cobros (no se tocan)
            </p>
          ) : null}
        </div>
        <div className="max-h-64 overflow-y-auto rounded-md border border-border text-sm">
          <table className="w-full">
            <thead className="sticky top-0 bg-muted/80 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2 w-10" />
                <th className="p-2">Alumno</th>
                <th className="p-2 text-right">Importe</th>
                <th className="p-2">Notas</th>
              </tr>
            </thead>
            <tbody>
              {preview.isLoading ? (
                <tr>
                  <td colSpan={4} className="p-3 text-muted-foreground">
                    Cargando vista previa…
                  </td>
                </tr>
              ) : (
                eligibleRows.map((r) => (
                  <tr key={r.studentId} className="border-t border-border/60">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={!excluded.has(r.studentId)}
                        onChange={() => toggleStudent(r.studentId)}
                        aria-label={`Incluir ${r.studentName}`}
                      />
                    </td>
                    <td className="p-2">{r.studentName}</td>
                    <td className="p-2 text-right">{formatMoney(r.totalAmount)}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {r.existingFeeId ? "Actualizar cuota existente" : "Nueva cuota"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {message ? <p className="text-sm text-income">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            size="sm"
            disabled={generate.isPending || toGenerate.length === 0}
            onClick={() => {
              setMessage(null);
              setError(null);
              generate.mutate();
            }}
          >
            {generate.isPending
              ? "Generando…"
              : `Generar ${toGenerate.length} cuota(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
