import { BulkGenerateDialog, type BulkRow } from "@/components/bulk/BulkGenerateDialog";
import { api } from "@/lib/api";

type PreviewRow = {
  studentId: string;
  studentName: string;
  totalAmount: number;
  issue: "ready" | "no_amount" | "has_payments";
  existingFeeId: string | null;
};

async function fetchRows(yearMonth: string): Promise<BulkRow[]> {
  const data = await api<{ rows: PreviewRow[] }>("/tariffs/generate-month/preview", {
    method: "POST",
    body: JSON.stringify({ yearMonth }),
  });
  return data.rows.map((r) => ({
    id: r.studentId,
    name: r.studentName,
    amount: r.totalAmount,
    issue: r.issue,
    detail: r.existingFeeId ? "Se recalcula la cuota existente" : "Cuota nueva",
  }));
}

async function generate(yearMonth: string, studentIds: string[]) {
  const res = await api<{ generated: number; skipped: number }>("/tariffs/generate-month", {
    method: "POST",
    body: JSON.stringify({ yearMonth, studentIds }),
  });
  return `Cuotas generadas: ${res.generated}${res.skipped ? ` · omitidas: ${res.skipped}` : ""}.`;
}

/** Generar las cuotas del mes de los alumnos elegidos (con confirmación). */
export function BulkFeeGenerateDialog({
  open,
  onOpenChange,
  defaultMonth,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMonth?: string;
}) {
  return (
    <BulkGenerateDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generar cuotas del mes"
      defaultMonth={defaultMonth}
      nouns={{ one: "cuota", many: "cuotas" }}
      queryKey="bulk-fee-preview"
      fetchRows={fetchRows}
      generate={generate}
      issueLabels={{
        no_amount: "Sin importe: revise matrículas, tarifas o cuota fija",
        has_payments: "Ya tiene cobros ese mes: no se modifica",
      }}
      recalcNote="Las cuotas que ya existían sin cobros se recalcularán con las tarifas actuales."
    />
  );
}
