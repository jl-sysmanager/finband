import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2 } from "lucide-react";
import { feeStatusBadge } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, downloadUrl } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useConfirm } from "@/hooks/useConfirm";

export type PayoutRow = {
  id: string;
  yearMonth: string;
  amount: number;
  baseAmount: number;
  transportAmount: number;
  workDays: number;
  amountPaid: number;
  status: string;
  paidAt?: string | null;
  teacher: { firstName: string; lastName: string };
};

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagado",
};

type Props = {
  payout: PayoutRow;
  onClose?: () => void;
  onDeleted?: () => void;
};

export function TeacherPayoutDetailPanel({ payout, onClose, onDeleted }: Props) {
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { confirm, dialog: confirmDialog } = useConfirm();
  const pending = payout.amount - payout.amountPaid;

  const payPayout = useMutation({
    mutationFn: () =>
      api("/payments/teacher-payouts/pay", {
        method: "POST",
        body: JSON.stringify({ payoutId: payout.id, amount: pending }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-payouts"] }),
  });

  const resetPayoutPayment = useMutation({
    mutationFn: () =>
      api(`/payments/teacher-payouts/${payout.id}`, {
        method: "PATCH",
        body: JSON.stringify({ amountPaid: 0 }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-payouts"] }),
  });

  const deletePayout = useMutation({
    mutationFn: () => api(`/payments/teacher-payouts/${payout.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher-payouts"] });
      onDeleted?.();
      onClose?.();
    },
  });

  async function markPaid() {
    const ok = await confirm({
      title: "Registrar pago",
      description: `¿Registrar pago de ${formatMoney(pending)}?`,
      confirmLabel: "Registrar",
    });
    if (ok) payPayout.mutate();
  }

  async function resetPayment() {
    const ok = await confirm({
      title: "Anular pago",
      description: "¿Dejar la liquidación pendiente?",
      confirmLabel: "Anular",
      destructive: true,
    });
    if (ok) resetPayoutPayment.mutate();
  }

  async function remove() {
    const ok = await confirm({
      title: "Eliminar liquidación",
      description: "¿Eliminar esta liquidación?",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePayout.mutateAsync();
    } catch (err) {
      void err;
    }
  }

  return (
    <>
      {confirmDialog}
      <div className="space-y-4 text-sm">
        <Badge variant={feeStatusBadge(payout.status)}>
          {PAYOUT_STATUS_LABELS[payout.status] ?? payout.status}
        </Badge>
        <dl className="grid gap-2 rounded-lg bg-muted/30 p-3">
          <Row label="Mes" value={payout.yearMonth} />
          <Row label="Base" value={formatMoney(payout.baseAmount)} />
          <Row label="Transporte" value={formatMoney(payout.transportAmount)} />
          {payout.workDays > 0 ? <Row label="Jornadas" value={String(payout.workDays)} /> : null}
          <Row label="Total" value={formatMoney(payout.amount)} />
          <Row label="Pagado" value={formatMoney(payout.amountPaid)} />
          {payout.paidAt ? <Row label="Fecha pago" value={formatDate(payout.paidAt)} /> : null}
        </dl>
        <Button asChild size="sm" variant="outline" className="w-full">
          <a href={downloadUrl(`/reports/receipts/teacher-payout/${payout.id}`)} target="_blank" rel="noreferrer">
            <FileText className="h-4 w-4" /> Descargar PDF
          </a>
        </Button>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {pending > 0 ? (
              <Button size="sm" disabled={payPayout.isPending} onClick={() => void markPaid()}>
                Marcar pagado ({formatMoney(pending)})
              </Button>
            ) : null}
            {payout.amountPaid > 0 ? (
              <Button size="sm" variant="outline" onClick={() => void resetPayment()}>
                Anular pago
              </Button>
            ) : null}
            <Button size="sm" variant="destructive" onClick={() => void remove()}>
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
