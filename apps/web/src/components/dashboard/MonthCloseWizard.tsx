import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { BulkFeeGenerateDialog } from "@/components/fees/BulkFeeGenerateDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, api } from "@/lib/api";
import { currentYearMonth, formatMoney } from "@/lib/utils";
import { toast } from "@/stores/toast";
import { Link } from "react-router-dom";

type ActionItems = {
  yearMonth: string;
  studentsWithoutFee: { count: number };
  unpaidFees: { count: number; totalPending: number };
  pendingPayouts: { count: number; totalPending: number };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MonthCloseWizard({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const ym = currentYearMonth();
  const [step, setStep] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);

  const actions = useQuery({
    queryKey: ["dashboard-action-items", ym],
    queryFn: () => api<ActionItems>(`/dashboard/action-items?yearMonth=${ym}`),
    enabled: open,
  });

  const genPayouts = useMutation({
    mutationFn: () =>
      api<{ generated: number; yearMonth: string }>("/payments/teacher-payouts/generate", {
        method: "POST",
        body: JSON.stringify({ yearMonth: ym }),
      }),
    onSuccess: (data) => {
      toast(`Liquidaciones: ${data.generated} generada(s)`, "success");
      qc.invalidateQueries({ queryKey: ["dashboard-action-items"] });
      qc.invalidateQueries({ queryKey: ["teacher-payouts"] });
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "Error al generar liquidaciones", "error"),
  });

  const a = actions.data;
  const steps = [
    {
      title: "Cuotas del mes",
      body: `${a?.studentsWithoutFee.count ?? "…"} alumno(s) sin cuota de ${ym}.`,
      action: (
        <Button size="sm" onClick={() => setBulkOpen(true)}>
          Generar cuotas
        </Button>
      ),
    },
    {
      title: "Impagos",
      body: `${a?.unpaidFees.count ?? "…"} cuota(s) pendientes · ${formatMoney(a?.unpaidFees.totalPending ?? 0)}`,
      action: (
        <Button size="sm" variant="outline" asChild>
          <Link to="/pagos" onClick={() => onOpenChange(false)}>
            Ir a pagos
          </Link>
        </Button>
      ),
    },
    {
      title: "Liquidaciones profesores",
      body: `${a?.pendingPayouts.count ?? "…"} pendiente(s) · ${formatMoney(a?.pendingPayouts.totalPending ?? 0)}`,
      action: (
        <Button size="sm" disabled={genPayouts.isPending} onClick={() => genPayouts.mutate()}>
          Generar liquidaciones
        </Button>
      ),
    },
    {
      title: "Informes",
      body: "Revisa el cuadro de mando y los informes de control diario.",
      action: (
        <Button size="sm" variant="outline" asChild>
          <Link to="/informes" onClick={() => onOpenChange(false)}>
            Abrir informes
          </Link>
        </Button>
      ),
    },
  ];

  const current = steps[step];

  return (
    <>
      <BulkFeeGenerateDialog open={bulkOpen} onOpenChange={setBulkOpen} defaultMonth={ym} />
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setStep(0);
          onOpenChange(o);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Cierre del mes — {ym}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Paso {step + 1} de {steps.length}
          </p>
          {actions.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : current ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <p className="font-medium">{current.title}</p>
              <p className="text-sm text-muted-foreground">{current.body}</p>
              {current.action}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              Anterior
            </Button>
            {step < steps.length - 1 ? (
              <Button type="button" size="sm" onClick={() => setStep((s) => s + 1)}>
                Siguiente <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
                Finalizar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
