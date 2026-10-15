import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@finband/shared";
import { useMemo, useState } from "react";
import type { StudentFeeRow } from "@/components/detail/StudentFeeDetailPanel";
import { Field } from "@/components/form/Field";
import { FormSelect } from "@/components/form/FormSelect";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/hooks/useConfirm";
import { ApiError, api, downloadUrl } from "@/lib/api";
import { invalidateFinanceQueries } from "@/lib/query-invalidation";
import { formatMoney, roundMoney } from "@/lib/utils";

const METHOD_OPTIONS = PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }));

const pendingOf = (f: StudentFeeRow) => Math.max(0, roundMoney(f.totalAmount - f.amountPaid));

/** Diálogo "Registrar cobro" de la pantalla de pagos (elige cuota, importe y método). */
export function RegisterPaymentDialog({
  open,
  onOpenChange,
  fees,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fees: StudentFeeRow[];
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();

  async function offerReceipt(paymentId: string) {
    const ok = await confirm({
      title: "Recibo de cobro",
      description: "¿Descargar recibo del cobro?",
      confirmLabel: "Descargar",
    });
    if (ok) window.open(downloadUrl(`/reports/receipts/student-payment/${paymentId}`), "_blank");
  }

  return (
    <>
      {confirmDialog}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Registrar cobro</DialogTitle>
          </DialogHeader>
          {/* El contenido se monta al abrir: cada apertura empieza con el formulario vacío. */}
          <RegisterPaymentForm
            fees={fees}
            onCancel={() => onOpenChange(false)}
            onDone={(paymentId) => {
              onOpenChange(false);
              void offerReceipt(paymentId);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function RegisterPaymentForm({
  fees,
  onCancel,
  onDone,
}: {
  fees: StudentFeeRow[];
  onCancel: () => void;
  onDone: (paymentId: string) => void;
}) {
  const qc = useQueryClient();
  const [feeId, setFeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("EFECTIVO");
  const [error, setError] = useState<string | null>(null);

  const selected = fees.find((f) => f.id === feeId);
  const feeOptions = useMemo(
    () =>
      fees
        .filter((f) => pendingOf(f) > 0)
        .map((f) => ({
          value: f.id,
          label: `${f.student.lastName}, ${f.student.firstName} · ${f.yearMonth} · pend. ${formatMoney(pendingOf(f))}`,
        })),
    [fees],
  );

  const pay = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/payments/student-payments", {
        method: "POST",
        body: JSON.stringify({ feeId, amount: Number(amount), method }),
      }),
    onSuccess: (data) => {
      void invalidateFinanceQueries(qc);
      onDone(data.id);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el cobro"),
  });

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Pendiente:{" "}
        <span className="font-medium text-foreground">
          {selected
            ? `${selected.student.lastName}, ${selected.student.firstName} (${selected.yearMonth}) — ${formatMoney(pendingOf(selected))}`
            : "Selecciona una cuota"}
        </span>
      </p>
      <div className="grid gap-3">
        <Field label="Cuota">
          <FormSelect
            value={feeId}
            onValueChange={(id) => {
              setFeeId(id);
              setError(null);
              const f = fees.find((x) => x.id === id);
              const pending = f ? pendingOf(f) : 0;
              setAmount(pending > 0 ? String(pending) : "");
            }}
            options={feeOptions}
            placeholder="Seleccionar alumno y mes…"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Importe">
            <Input
              type="number"
              step="0.01"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Método">
            <FormSelect value={method} onValueChange={setMethod} options={METHOD_OPTIONS} />
          </Field>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter className="pt-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={!feeId || !(Number(amount) > 0) || pay.isPending}
          onClick={() => {
            setError(null);
            pay.mutate();
          }}
        >
          Registrar
        </Button>
      </DialogFooter>
    </>
  );
}
