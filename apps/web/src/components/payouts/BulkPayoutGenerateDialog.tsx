import { PAY_METHOD_LABELS, type PayMethod } from "@finband/shared";
import { BulkGenerateDialog, type BulkRow } from "@/components/bulk/BulkGenerateDialog";
import { api } from "@/lib/api";

type PreviewRow = {
  teacherId: string;
  teacherName: string;
  payMethod: PayMethod;
  sessionCount: number;
  amount: number;
  issue: "ready" | "no_amount" | "has_payments";
  existingPayoutId: string | null;
  warnings: string[];
};

async function fetchRows(yearMonth: string): Promise<BulkRow[]> {
  const data = await api<{ rows: PreviewRow[] }>("/payments/teacher-payouts/generate/preview", {
    method: "POST",
    body: JSON.stringify({ yearMonth }),
  });
  return data.rows.map((r) => ({
    id: r.teacherId,
    name: r.teacherName,
    amount: r.amount,
    issue: r.issue,
    detail: [
      PAY_METHOD_LABELS[r.payMethod],
      r.payMethod === "MONTHLY_SALARY" ? null : `${r.sessionCount} sesiones`,
      r.existingPayoutId ? "se recalcula" : "nueva",
    ]
      .filter(Boolean)
      .join(" · "),
    warning: r.warnings[0],
  }));
}

async function generate(yearMonth: string, teacherIds: string[]) {
  const res = await api<{ generated: number; skippedWithPayments: number; skippedNoAmount: number }>(
    "/payments/teacher-payouts/generate",
    { method: "POST", body: JSON.stringify({ yearMonth, teacherIds }) },
  );
  const skipped = res.skippedWithPayments + res.skippedNoAmount;
  return `Liquidaciones generadas: ${res.generated}${skipped ? ` · omitidas: ${skipped}` : ""}.`;
}

/** Generar las liquidaciones del mes de los profesores elegidos (con confirmación). */
export function BulkPayoutGenerateDialog({
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
      title="Generar liquidaciones del mes"
      defaultMonth={defaultMonth}
      nouns={{ one: "liquidación", many: "liquidaciones" }}
      queryKey="bulk-payout-preview"
      fetchRows={fetchRows}
      generate={generate}
      issueLabels={{
        no_amount: "Sin importe este mes",
        has_payments: "Ya tiene pagos ese mes: no se recalcula",
      }}
      recalcNote="Las liquidaciones que ya existían sin pagos se recalcularán con el horario y la tarifa actuales."
    />
  );
}
