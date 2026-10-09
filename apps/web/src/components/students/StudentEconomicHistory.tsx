import { FEE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@finband/shared";
import { FileText, Trash2 } from "lucide-react";
import { Badge, feeStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { downloadUrl } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/utils";

type Payment = {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
};

type Fee = {
  id: string;
  yearMonth: string;
  totalAmount: number;
  amountPaid: number;
  status: keyof typeof FEE_STATUS_LABELS;
  payments: Payment[];
};

type Discount = {
  id: string;
  name: string;
  type: string;
  value: number;
};

type Props = {
  fees: Fee[];
  discounts: Discount[];
  isAdmin: boolean;
  onDeleteFee?: (feeId: string) => void;
  deleteFeePending?: boolean;
  onReminder?: (feeId: string) => void;
};

export function StudentEconomicHistory({
  fees,
  discounts,
  isAdmin,
  onDeleteFee,
  deleteFeePending,
  onReminder,
}: Props) {
  return (
    <div className="space-y-6">
      {discounts.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-medium">Descuentos / becas</p>
          <ul className="text-sm text-muted-foreground">
            {discounts.map((d) => (
              <li key={d.id}>
                {d.name}: {d.type === "PERCENT" ? `${d.value}%` : formatMoney(d.value)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium">Historial de cuotas y cobros</p>
        {fees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cuotas registradas.</p>
        ) : (
          <div className="space-y-4">
            {fees.map((f) => {
              const pending = Math.max(0, f.totalAmount - f.amountPaid);
              return (
                <div key={f.id} className="rounded-lg border border-border/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{f.yearMonth}</span>
                      <Badge variant={feeStatusBadge(f.status)}>
                        {FEE_STATUS_LABELS[f.status]}
                      </Badge>
                    </div>
                    <div className="text-sm">
                      {formatMoney(f.amountPaid)} / {formatMoney(f.totalAmount)}
                      {pending > 0 ? (
                        <span className="ml-2 text-expense">Pend. {formatMoney(pending)}</span>
                      ) : null}
                    </div>
                  </div>
                  {f.payments.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {f.payments.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {formatDate(p.paidAt)} · {formatMoney(p.amount)} ·{" "}
                            {
                              PAYMENT_METHOD_LABELS[
                                p.method as keyof typeof PAYMENT_METHOD_LABELS
                              ]
                            }
                          </span>
                          <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                            <a
                              href={downloadUrl(`/reports/receipts/student-payment/${p.id}`)}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Descargar recibo"
                            >
                              <FileText className="h-4 w-4" />
                            </a>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">Sin cobros registrados</p>
                  )}
                  {isAdmin ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {pending > 0 && onReminder ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => onReminder(f.id)}>
                          Recordatorio
                        </Button>
                      ) : null}
                      {onDeleteFee ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Eliminar cuota"
                          disabled={deleteFeePending}
                          onClick={() => onDeleteFee(f.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
