import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FEE_STATUS_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@finband/shared";
import { FileText, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { MonthSelect } from "@/components/form/MonthSelect";
import { FilterField } from "@/components/list/FilterField";
import { ListToolbar } from "@/components/list/ListToolbar";
import { PageHeader } from "@/components/list/PageHeader";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClassName } from "@/lib/form-classes";
import { api, downloadUrl } from "@/lib/api";
import { buildQuery, currentYearMonth, formatDate, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

type StudentPayment = {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
};

type StudentFee = {
  id: string;
  yearMonth: string;
  totalAmount: number;
  amountPaid: number;
  status: keyof typeof FEE_STATUS_LABELS;
  student: { firstName: string; lastName: string };
  payments: StudentPayment[];
};

type PayoutRow = {
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

export function PaymentsPage() {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const qc = useQueryClient();
  const [section, setSection] = useState<"students" | "teachers">("students");
  const [monthFrom, setMonthFrom] = useState(currentYearMonth());
  const [monthTo, setMonthTo] = useState(currentYearMonth());
  const [search, setSearch] = useState("");
  const [feeStatus, setFeeStatus] = useState("");
  const [payoutStatus, setPayoutStatus] = useState("");
  const [payFeeId, setPayFeeId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("EFECTIVO");

  const feeQuery = buildQuery({
    monthFrom,
    monthTo,
    search: search || undefined,
    status: feeStatus || undefined,
  });

  const payoutQuery = buildQuery({
    monthFrom,
    monthTo,
    search: search || undefined,
    status: payoutStatus || undefined,
  });

  const fees = useQuery({
    queryKey: ["student-fees", feeQuery],
    queryFn: () => api<StudentFee[]>(`/payments/student-fees${feeQuery}`),
  });

  const payouts = useQuery({
    queryKey: ["teacher-payouts", payoutQuery],
    queryFn: () => api<PayoutRow[]>(`/payments/teacher-payouts${payoutQuery}`),
  });

  const selectedFee = useMemo(
    () => fees.data?.find((f) => f.id === payFeeId),
    [fees.data, payFeeId],
  );

  const pendingSelected = selectedFee
    ? Math.max(0, selectedFee.totalAmount - selectedFee.amountPaid)
    : 0;

  const payFee = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/payments/student-payments", {
        method: "POST",
        body: JSON.stringify({
          feeId: payFeeId,
          amount: Number(payAmount),
          method: payMethod,
        }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["student-fees"] });
      setPayAmount("");
      if (data?.id && confirm("¿Descargar recibo del cobro?")) {
        window.open(downloadUrl(`/reports/receipts/student-payment/${data.id}`), "_blank");
      }
    },
  });

  const deletePayment = useMutation({
    mutationFn: (id: string) => api(`/payments/student-payments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student-fees"] }),
  });

  const genPayouts = useMutation({
    mutationFn: () =>
      api("/payments/teacher-payouts/generate", {
        method: "POST",
        body: JSON.stringify({ yearMonth: monthTo }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-payouts"] }),
  });

  const payPayout = useMutation({
    mutationFn: (p: PayoutRow) =>
      api("/payments/teacher-payouts/pay", {
        method: "POST",
        body: JSON.stringify({
          payoutId: p.id,
          amount: p.amount - p.amountPaid,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-payouts"] }),
  });

  const deletePayout = useMutation({
    mutationFn: (id: string) => api(`/payments/teacher-payouts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-payouts"] }),
  });

  const deleteFee = useMutation({
    mutationFn: (id: string) => api(`/payments/student-fees/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-fees"] });
      setPayFeeId("");
      setPayAmount("");
    },
  });

  const resetPayoutPayment = useMutation({
    mutationFn: (id: string) =>
      api(`/payments/teacher-payouts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ amountPaid: 0 }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-payouts"] }),
  });

  function selectFee(f: StudentFee) {
    setPayFeeId(f.id);
    const pending = Math.max(0, f.totalAmount - f.amountPaid);
    setPayAmount(pending > 0 ? String(pending) : "");
  }

  function feeBadgeClass(status: keyof typeof FEE_STATUS_LABELS) {
    if (status === "PAID") return "bg-income/15 text-income";
    if (status === "PARTIAL") return "bg-muted text-foreground";
    return "border border-border bg-transparent";
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Control de pagos"
        description="Cobros de alumnos y liquidaciones a profesores"
      />

      <Card>
        <ListToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar por nombre…">
          <FilterField label="Mes desde">
            <MonthSelect value={monthFrom} onChange={setMonthFrom} />
          </FilterField>
          <FilterField label="Mes hasta">
            <MonthSelect value={monthTo} onChange={setMonthTo} />
          </FilterField>
          {section === "students" ? (
            <FilterField label="Estado cuota">
              <select
                className={selectClassName}
                value={feeStatus}
                onChange={(e) => setFeeStatus(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="PENDING">Pendiente</option>
                <option value="PARTIAL">Parcial</option>
                <option value="PAID">Pagado</option>
              </select>
            </FilterField>
          ) : (
            <FilterField label="Estado liquidación">
              <select
                className={selectClassName}
                value={payoutStatus}
                onChange={(e) => setPayoutStatus(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="PENDING">Pendiente</option>
                <option value="PARTIAL">Parcial</option>
                <option value="PAID">Pagado</option>
              </select>
            </FilterField>
          )}
        </ListToolbar>

        <div className="flex gap-2 border-b border-border px-6 pb-0 pt-2">
          <Button
            size="sm"
            variant={section === "students" ? "default" : "ghost"}
            onClick={() => setSection("students")}
          >
            Cobros de alumnos
          </Button>
          <Button
            size="sm"
            variant={section === "teachers" ? "default" : "ghost"}
            onClick={() => setSection("teachers")}
          >
            Pagos a profesores
          </Button>
        </div>

        {section === "students" ? (
          <CardContent className="space-y-4 pt-6">
            {isAdmin ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="mb-3 text-sm font-medium">Registrar cobro</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Selecciona una cuota en la tabla o elige manualmente. Importe pendiente:{" "}
                  <span className="font-medium text-foreground">
                    {selectedFee
                      ? `${selectedFee.student.lastName}, ${selectedFee.student.firstName} (${selectedFee.yearMonth}) — ${formatMoney(pendingSelected)}`
                      : "—"}
                  </span>
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[280px] flex-1 space-y-1">
                    <Label>Cuota</Label>
                    <select
                      className={selectClassName}
                      value={payFeeId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setPayFeeId(id);
                        const f = fees.data?.find((x) => x.id === id);
                        if (f) selectFee(f);
                      }}
                    >
                      <option value="">Seleccionar alumno y mes…</option>
                      {fees.data?.map((f) => {
                        const pending = f.totalAmount - f.amountPaid;
                        if (pending <= 0) return null;
                        return (
                          <option key={f.id} value={f.id}>
                            {f.student.lastName}, {f.student.firstName} · {f.yearMonth} · pend.{" "}
                            {formatMoney(pending)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="w-32 space-y-1">
                    <Label>Importe</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                  </div>
                  <div className="w-40 space-y-1">
                    <Label>Método</Label>
                    <select
                      className={selectClassName}
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    disabled={!payFeeId || !payAmount || payFee.isPending}
                    onClick={() => payFee.mutate()}
                  >
                    Registrar cobro
                  </Button>
                </div>
              </div>
            ) : null}

            <DataTable>
              <DataTableHead>
                <DataTableTh>Alumno</DataTableTh>
                <DataTableTh>Mes</DataTableTh>
                <DataTableTh>Total</DataTableTh>
                <DataTableTh>Pagado</DataTableTh>
                <DataTableTh>Pendiente</DataTableTh>
                <DataTableTh>Estado</DataTableTh>
                <DataTableTh className="w-24" />
              </DataTableHead>
              <tbody>
                {fees.data?.map((f) => {
                  const pending = f.totalAmount - f.amountPaid;
                  const selected = payFeeId === f.id;
                  return (
                    <DataTableRow
                      key={f.id}
                      className={selected ? "bg-primary/5" : undefined}
                      onClick={() => isAdmin && selectFee(f)}
                    >
                      <DataTableTd className="font-medium">
                        {f.student.lastName}, {f.student.firstName}
                      </DataTableTd>
                      <DataTableTd>{f.yearMonth}</DataTableTd>
                      <DataTableTd>{formatMoney(f.totalAmount)}</DataTableTd>
                      <DataTableTd>{formatMoney(f.amountPaid)}</DataTableTd>
                      <DataTableTd>{formatMoney(pending)}</DataTableTd>
                      <DataTableTd>
                        <Badge className={feeBadgeClass(f.status)}>
                          {FEE_STATUS_LABELS[f.status]}
                        </Badge>
                      </DataTableTd>
                      <DataTableTd className="text-right">
                        <div className="flex justify-end gap-1">
                          {isAdmin && pending > 0 ? (
                            <Button
                              size="sm"
                              variant={selected ? "default" : "outline"}
                              onClick={(e) => {
                                e.stopPropagation();
                                selectFee(f);
                              }}
                            >
                              Cobrar
                            </Button>
                          ) : null}
                          {isAdmin ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Eliminar cuota"
                              onClick={(e) => {
                                e.stopPropagation();
                                const msg =
                                  f.payments.length > 0
                                    ? `¿Eliminar la cuota y sus ${f.payments.length} cobro(s)?`
                                    : "¿Eliminar esta cuota?";
                                if (confirm(msg)) deleteFee.mutate(f.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-expense" />
                            </Button>
                          ) : null}
                        </div>
                      </DataTableTd>
                    </DataTableRow>
                  );
                })}
              </tbody>
            </DataTable>

            {fees.data?.some((f) => f.payments.length > 0) ? (
              <div className="space-y-3 pt-2">
                <p className="text-sm font-medium">Detalle de cobros en el periodo</p>
                {fees.data.map((f) =>
                  f.payments.length === 0 ? null : (
                    <div key={f.id} className="rounded-lg border border-border/80 p-3 text-sm">
                      <p className="font-medium">
                        {f.student.lastName}, {f.student.firstName} — {f.yearMonth}
                      </p>
                      <DataTable className="mt-2">
                        <DataTableHead>
                          <DataTableTh>Fecha</DataTableTh>
                          <DataTableTh>Importe</DataTableTh>
                          <DataTableTh>Método</DataTableTh>
                          <DataTableTh className="text-right" />
                        </DataTableHead>
                        <tbody>
                          {f.payments.map((p) => (
                            <DataTableRow key={p.id}>
                              <DataTableTd>{formatDate(p.paidAt)}</DataTableTd>
                              <DataTableTd>{formatMoney(p.amount)}</DataTableTd>
                              <DataTableTd>
                                {
                                  PAYMENT_METHOD_LABELS[
                                    p.method as keyof typeof PAYMENT_METHOD_LABELS
                                  ]
                                }
                              </DataTableTd>
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
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => {
                                      if (confirm("¿Anular este cobro?")) deletePayment.mutate(p.id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-expense" />
                                  </Button>
                                ) : null}
                              </DataTableTd>
                            </DataTableRow>
                          ))}
                        </tbody>
                      </DataTable>
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </CardContent>
        ) : (
          <CardContent className="pt-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Liquidaciones del periodo · mes de referencia hasta {monthTo}
              </p>
              {isAdmin ? (
                <Button size="sm" variant="outline" onClick={() => genPayouts.mutate()}>
                  Generar liquidaciones ({monthTo})
                </Button>
              ) : null}
            </div>
            <DataTable>
              <DataTableHead>
                <DataTableTh>Profesor</DataTableTh>
                <DataTableTh>Mes</DataTableTh>
                <DataTableTh>Base</DataTableTh>
                <DataTableTh>Transporte</DataTableTh>
                <DataTableTh>Total</DataTableTh>
                <DataTableTh>Pagado</DataTableTh>
                <DataTableTh>Estado</DataTableTh>
                <DataTableTh className="text-right">Acciones</DataTableTh>
              </DataTableHead>
              <tbody>
                {payouts.data?.map((p) => (
                  <DataTableRow key={p.id}>
                    <DataTableTd className="font-medium">
                      {p.teacher.lastName}, {p.teacher.firstName}
                      {p.workDays > 0 && p.transportAmount > 0 ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {p.workDays} jornadas
                        </span>
                      ) : null}
                    </DataTableTd>
                    <DataTableTd>{p.yearMonth}</DataTableTd>
                    <DataTableTd>{formatMoney(p.baseAmount)}</DataTableTd>
                    <DataTableTd>{formatMoney(p.transportAmount)}</DataTableTd>
                    <DataTableTd>{formatMoney(p.amount)}</DataTableTd>
                    <DataTableTd>{formatMoney(p.amountPaid)}</DataTableTd>
                    <DataTableTd>
                      <Badge
                        className={
                          p.status === "PAID"
                            ? "bg-income/15 text-income"
                            : "border border-border bg-transparent"
                        }
                      >
                        {PAYOUT_STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                      {p.paidAt ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {formatDate(p.paidAt)}
                        </span>
                      ) : null}
                    </DataTableTd>
                    <DataTableTd className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={downloadUrl(`/reports/receipts/teacher-payout/${p.id}`)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FileText className="h-4 w-4" /> PDF
                          </a>
                        </Button>
                        {isAdmin && p.amountPaid < p.amount ? (
                          <Button
                            size="sm"
                            disabled={payPayout.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `¿Registrar pago de ${formatMoney(p.amount - p.amountPaid)} a ${p.teacher.firstName} ${p.teacher.lastName}?`,
                                )
                              ) {
                                payPayout.mutate(p);
                              }
                            }}
                          >
                            Marcar pagado
                          </Button>
                        ) : null}
                        {isAdmin && p.amountPaid > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resetPayoutPayment.isPending}
                            onClick={() => {
                              if (confirm("¿Anular el pago registrado y dejar la liquidación pendiente?")) {
                                resetPayoutPayment.mutate(p.id);
                              }
                            }}
                          >
                            Anular pago
                          </Button>
                        ) : null}
                        {isAdmin ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("¿Eliminar esta liquidación?")) deletePayout.mutate(p.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-expense" />
                          </Button>
                        ) : null}
                      </div>
                    </DataTableTd>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTable>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
