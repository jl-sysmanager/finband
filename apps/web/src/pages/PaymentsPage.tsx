import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FEE_STATUS_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@finband/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { currentYearMonth, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useState } from "react";

export function PaymentsPage() {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const qc = useQueryClient();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [payFeeId, setPayFeeId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("EFECTIVO");

  const fees = useQuery({
    queryKey: ["student-fees", yearMonth],
    queryFn: () =>
      api<
        Array<{
          id: string;
          yearMonth: string;
          totalAmount: number;
          amountPaid: number;
          status: keyof typeof FEE_STATUS_LABELS;
          student: { firstName: string; lastName: string };
        }>
      >(`/payments/student-fees?yearMonth=${yearMonth}`),
  });

  const payouts = useQuery({
    queryKey: ["teacher-payouts", yearMonth],
    queryFn: () =>
      api<
        Array<{
          id: string;
          amount: number;
          amountPaid: number;
          status: string;
          teacher: { firstName: string; lastName: string };
        }>
      >(`/payments/teacher-payouts?yearMonth=${yearMonth}`),
  });

  const payFee = useMutation({
    mutationFn: () =>
      api("/payments/student-payments", {
        method: "POST",
        body: JSON.stringify({
          feeId: payFeeId,
          amount: Number(payAmount),
          method: payMethod,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-fees"] });
      setPayAmount("");
    },
  });

  const genPayouts = useMutation({
    mutationFn: () =>
      api("/payments/teacher-payouts/generate", {
        method: "POST",
        body: JSON.stringify({ yearMonth }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-payouts"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Control de pagos</h1>
        <Input
          className="max-w-[140px]"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cobros de alumnos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <select
                className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
                value={payFeeId}
                onChange={(e) => setPayFeeId(e.target.value)}
              >
                <option value="">Cuota…</option>
                {fees.data?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.student.lastName} — pend. {formatMoney(f.totalAmount - f.amountPaid)}
                  </option>
                ))}
              </select>
              <Input
                className="max-w-[120px]"
                placeholder="Importe"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
              <select
                className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
              <Button
                disabled={!payFeeId || !payAmount}
                onClick={() => payFee.mutate()}
              >
                Registrar cobro
              </Button>
            </div>
          ) : null}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th>Alumno</th>
                <th>Total</th>
                <th>Pagado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {fees.data?.map((f) => (
                <tr key={f.id} className="border-t border-border/60">
                  <td className="py-2">
                    {f.student.firstName} {f.student.lastName}
                  </td>
                  <td>{formatMoney(f.totalAmount)}</td>
                  <td>{formatMoney(f.amountPaid)}</td>
                  <td>{FEE_STATUS_LABELS[f.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pagos a profesores</CardTitle>
          {isAdmin ? (
            <Button size="sm" variant="outline" onClick={() => genPayouts.mutate()}>
              Generar liquidaciones
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th>Profesor</th>
                <th>Importe</th>
                <th>Pagado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payouts.data?.map((p) => (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="py-2">
                    {p.teacher.firstName} {p.teacher.lastName}
                  </td>
                  <td>{formatMoney(p.amount)}</td>
                  <td>{formatMoney(p.amountPaid)}</td>
                  <td>
                    {isAdmin && p.amountPaid < p.amount ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          api("/payments/teacher-payouts/pay", {
                            method: "POST",
                            body: JSON.stringify({
                              payoutId: p.id,
                              amount: p.amount - p.amountPaid,
                            }),
                          }).then(() => qc.invalidateQueries({ queryKey: ["teacher-payouts"] }))
                        }
                      >
                        Marcar pagado
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
