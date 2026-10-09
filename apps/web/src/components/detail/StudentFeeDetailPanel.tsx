import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FEE_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@finband/shared";
import { Bell, FileText, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormSelect } from "@/components/form/FormSelect";
import { FeeReminderDialog } from "@/components/fees/FeeReminderDialog";
import { feeStatusBadge } from "@/components/ui/badge";
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
import { formatDate, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useConfirm } from "@/hooks/useConfirm";
export type StudentFeeRow = {
  id: string;
  yearMonth: string;
  totalAmount: number;
  amountPaid: number;
  status: keyof typeof FEE_STATUS_LABELS;
  student: { firstName: string; lastName: string };
  payments: Array<{ id: string; amount: number; method: string; paidAt: string }>;
};

type Props = {
  fee: StudentFeeRow;
  onClose?: () => void;
  onDeleted?: () => void;
};

const METHOD_OPTIONS = PAYMENT_METHODS.map((m) => ({
  value: m,
  label: PAYMENT_METHOD_LABELS[m],
}));

export function StudentFeeDetailPanel({ fee, onClose, onDeleted }: Props) {
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const { confirm, dialog: confirmDialog } = useConfirm();
  const pending = Math.max(0, fee.totalAmount - fee.amountPaid);
  const [payAmount, setPayAmount] = useState(pending > 0 ? String(pending) : "");
  const [payMethod, setPayMethod] = useState("EFECTIVO");
  const [reminderOpen, setReminderOpen] = useState(false);

  const payFee = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/payments/student-payments", {
        method: "POST",
        body: JSON.stringify({
          feeId: fee.id,
          amount: Number(payAmount),
          method: payMethod,
        }),
      }),
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["student-fees"] });
      if (data?.id) {
        const ok = await confirm({
          title: "Recibo",
          description: "¿Descargar recibo del cobro?",
          confirmLabel: "Descargar",
        });
        if (ok) window.open(downloadUrl(`/reports/receipts/student-payment/${data.id}`), "_blank");
      }
    },
  });

  const deletePayment = useMutation({
    mutationFn: (id: string) => api(`/payments/student-payments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student-fees"] }),
  });

  const deleteFee = useMutation({
    mutationFn: () => api(`/payments/student-fees/${fee.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-fees"] });
      onDeleted?.();
      onClose?.();
    },
  });

  async function voidPayment(paymentId: string) {
    const ok = await confirm({
      title: "Anular cobro",
      description: "¿Anular este cobro?",
      confirmLabel: "Anular",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePayment.mutateAsync(paymentId);
    } catch {
      /* ignore */
    }
  }

  async function removeFee() {
    const ok = await confirm({
      title: "Eliminar cuota",
      description:
        fee.payments.length > 0
          ? `¿Eliminar la cuota y sus ${fee.payments.length} cobro(s)?`
          : "¿Eliminar esta cuota?",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteFee.mutateAsync();
    } catch (err) {
      void err;
    }
  }

  return (
    <>
      {confirmDialog}
      <FeeReminderDialog feeId={fee.id} open={reminderOpen} onOpenChange={setReminderOpen} />
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={feeStatusBadge(fee.status)}>{FEE_STATUS_LABELS[fee.status]}</Badge>
          <span className="text-muted-foreground">{fee.yearMonth}</span>
        </div>
        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted/30 p-3">
          <div>
            <dt className="text-xs text-muted-foreground">Total</dt>
            <dd className="font-medium">{formatMoney(fee.totalAmount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Pagado</dt>
            <dd className="font-medium">{formatMoney(fee.amountPaid)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Pendiente</dt>
            <dd className="font-semibold text-primary">{formatMoney(pending)}</dd>
          </div>
        </dl>
        {isAdmin && pending > 0 ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">Registrar cobro</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Importe</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Método</Label>
                <FormSelect value={payMethod} onValueChange={setPayMethod} options={METHOD_OPTIONS} />
              </div>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={!payAmount || payFee.isPending}
              onClick={() => void payFee.mutateAsync()}
            >
              Cobrar
            </Button>
          </div>
        ) : null}
        {fee.payments.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Cobros registrados</p>
            <DataTable>
              <DataTableHead>
                <DataTableTh>Fecha</DataTableTh>
                <DataTableTh>Importe</DataTableTh>
                <DataTableTh className="w-20" />
              </DataTableHead>
              <tbody>
                {fee.payments.map((p) => (
                  <DataTableRow key={p.id}>
                    <DataTableTd>{formatDate(p.paidAt)}</DataTableTd>
                    <DataTableTd>{formatMoney(p.amount)}</DataTableTd>
                    <DataTableTd className="text-right">
                      <Button asChild size="icon" variant="ghost">
                        <a
                          href={downloadUrl(`/reports/receipts/student-payment/${p.id}`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileText className="h-4 w-4" />
                        </a>
                      </Button>
                      {isAdmin ? (
                        <Button size="icon" variant="ghost" onClick={() => void voidPayment(p.id)}>
                          <Trash2 className="h-4 w-4 text-expense" />
                        </Button>
                      ) : null}
                    </DataTableTd>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTable>
          </div>
        ) : null}
        {isAdmin ? (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {pending > 0 ? (
              <Button size="sm" variant="outline" onClick={() => setReminderOpen(true)}>
                <Bell className="h-4 w-4" /> Recordatorio
              </Button>
            ) : null}
            <Button size="sm" variant="destructive" onClick={() => void removeFee()}>
              Eliminar cuota
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
