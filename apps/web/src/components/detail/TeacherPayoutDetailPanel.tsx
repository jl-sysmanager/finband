import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2 } from "lucide-react";
import { useState } from "react";
import { feeStatusBadge } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { ApiError, api, downloadUrl } from "@/lib/api";
import { invalidateFinanceQueries } from "@/lib/query-invalidation";
import { formatDate, formatMoney, roundMoney } from "@/lib/utils";
import { toast } from "@/stores/toast";
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
  payments?: Array<{ id: string; amount: number; paidAt: string; notes?: string | null }>;
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
  const pending = roundMoney(payout.amount - payout.amountPaid);
  const [payAmount, setPayAmount] = useState(pending > 0 ? String(pending) : "");
  const [proposedFor, setProposedFor] = useState(pending);
  if (proposedFor !== pending) {
    setProposedFor(pending);
    setPayAmount(pending > 0 ? String(pending) : "");
  }
  const payments = payout.payments ?? [];

  const payPayout = useMutation({
    mutationFn: (amount: number) =>
      api("/payments/teacher-payouts/pay", {
        method: "POST",
        body: JSON.stringify({ payoutId: payout.id, amount: roundMoney(amount) }),
      }),
    onSuccess: () => invalidateFinanceQueries(qc),
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "No se pudo registrar el pago", "error"),
  });

  const deletePayment = useMutation({
    mutationFn: (paymentId: string) =>
      api(`/payments/teacher-payout-payments/${paymentId}`, { method: "DELETE" }),
    onSuccess: () => invalidateFinanceQueries(qc),
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "No se pudo anular el pago", "error"),
  });

  const resetPayoutPayment = useMutation({
    mutationFn: () =>
      api(`/payments/teacher-payouts/${payout.id}`, {
        method: "PATCH",
        body: JSON.stringify({ amountPaid: 0 }),
      }),
    onSuccess: () => invalidateFinanceQueries(qc),
  });

  const deletePayout = useMutation({
    mutationFn: () => api(`/payments/teacher-payouts/${payout.id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateFinanceQueries(qc);
      onDeleted?.();
      onClose?.();
    },
  });

  async function registerPayment() {
    const amount = Number(payAmount);
    if (!(amount > 0)) return;
    const ok = await confirm({
      title: "Registrar pago",
      description: `¿Registrar pago de ${formatMoney(amount)}?`,
      confirmLabel: "Registrar",
    });
    if (ok) payPayout.mutate(amount);
  }

  async function voidPayment(paymentId: string, amount: number) {
    const ok = await confirm({
      title: "Anular pago",
      description: `¿Anular el pago de ${formatMoney(amount)}?`,
      confirmLabel: "Anular",
      destructive: true,
    });
    if (ok) deletePayment.mutate(paymentId);
  }

  async function resetPayment() {
    const ok = await confirm({
      title: "Anular todos los pagos",
      description: "¿Anular todos los pagos y dejar la liquidación pendiente?",
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
          {payout.paidAt ? <Row label="Último pago" value={formatDate(payout.paidAt)} /> : null}
        </dl>
        {payments.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Pagos registrados</p>
            <DataTable>
              <DataTableHead>
                <DataTableTh>Fecha</DataTableTh>
                <DataTableTh>Importe</DataTableTh>
                {isAdmin ? <DataTableTh className="w-12" /> : null}
              </DataTableHead>
              <tbody>
                {payments.map((p) => (
                  <DataTableRow key={p.id}>
                    <DataTableTd>{formatDate(p.paidAt)}</DataTableTd>
                    <DataTableTd>{formatMoney(p.amount)}</DataTableTd>
                    {isAdmin ? (
                      <DataTableTd className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Anular pago"
                          disabled={deletePayment.isPending}
                          onClick={() => void voidPayment(p.id, p.amount)}
                        >
                          <Trash2 className="h-4 w-4 text-expense" />
                        </Button>
                      </DataTableTd>
                    ) : null}
                  </DataTableRow>
                ))}
              </tbody>
            </DataTable>
          </div>
        ) : null}
        <Button asChild size="sm" variant="outline" className="w-full">
          <a href={downloadUrl(`/reports/receipts/teacher-payout/${payout.id}`)} target="_blank" rel="noreferrer">
            <FileText className="h-4 w-4" /> Descargar PDF
          </a>
        </Button>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {pending > 0 ? (
              <div className="flex w-full items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`payout-amount-${payout.id}`}>
                    Importe (pendiente {formatMoney(pending)})
                  </Label>
                  <Input
                    id={`payout-amount-${payout.id}`}
                    type="number"
                    step="0.01"
                    min={0}
                    max={pending}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={!(Number(payAmount) > 0) || payPayout.isPending}
                  onClick={() => void registerPayment()}
                >
                  Registrar pago
                </Button>
              </div>
            ) : null}
            {payments.length > 1 ? (
              <Button size="sm" variant="outline" onClick={() => void resetPayment()}>
                Anular todos los pagos
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
