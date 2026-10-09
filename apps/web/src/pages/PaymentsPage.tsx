import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FEE_STATUS_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@finband/shared";
import { FileText, Layers, Trash2 } from "lucide-react";
import { EntityDetailSheet } from "@/components/layout/EntityDetailSheet";
import { StudentFeeDetailPanel } from "@/components/detail/StudentFeeDetailPanel";
import { TeacherPayoutDetailPanel } from "@/components/detail/TeacherPayoutDetailPanel";
import { BulkFeeGenerateDialog } from "@/components/fees/BulkFeeGenerateDialog";
import { useMemo, useState } from "react";
import { CollapsibleSection } from "@/components/list/CollapsibleSection";
import { TablePagination } from "@/components/list/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import { FormSelect } from "@/components/form/FormSelect";
import { MonthSelect } from "@/components/form/MonthSelect";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/hooks/useConfirm";
import { FilterField } from "@/components/list/FilterField";
import { ListToolbar } from "@/components/list/ListToolbar";
import { WorkspaceShell } from "@/components/layout/PageShell";
import { SegmentedControl } from "@/components/layout/SegmentedControl";
import { feeStatusBadge } from "@/components/ui/badge";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError, api, downloadUrl } from "@/lib/api";
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

const ALL_FILTER = "__all__";

const FEE_STATUS_FILTER = [
  { value: ALL_FILTER, label: "Todos" },
  { value: "PENDING", label: "Pendiente" },
  { value: "PARTIAL", label: "Parcial" },
  { value: "PAID", label: "Pagado" },
];

const PAYOUT_STATUS_FILTER = [
  { value: ALL_FILTER, label: "Todos" },
  { value: "PENDING", label: "Pendiente" },
  { value: "PARTIAL", label: "Parcial" },
  { value: "PAID", label: "Pagado" },
];

const METHOD_OPTIONS = PAYMENT_METHODS.map((m) => ({
  value: m,
  label: PAYMENT_METHOD_LABELS[m],
}));

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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedFeeId, setSelectedFeeId] = useState<string | null>(null);
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

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

  const sheetFee = useMemo(
    () => fees.data?.find((f) => f.id === selectedFeeId) ?? null,
    [fees.data, selectedFeeId],
  );

  const sheetPayout = useMemo(
    () => payouts.data?.find((p) => p.id === selectedPayoutId) ?? null,
    [payouts.data, selectedPayoutId],
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-fees"] });
      setPayAmount("");
    },
  });

  const deletePayment = useMutation({
    mutationFn: (id: string) => api(`/payments/student-payments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-fees"] });
      setDeleteError(null);
    },
  });

  const genPayouts = useMutation({
    mutationFn: () =>
      api("/payments/teacher-payouts/generate", {
        method: "POST",
        body: JSON.stringify({ yearMonth: monthTo }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-payouts"] }),
  });

  function selectFee(f: StudentFee) {
    setPayFeeId(f.id);
    const pending = Math.max(0, f.totalAmount - f.amountPaid);
    setPayAmount(pending > 0 ? String(pending) : "");
  }

  const feeRows = fees.data ?? [];
  const feePagination = usePagination(feeRows, 10);
  const payoutPagination = usePagination(payouts.data ?? [], 10);

  const pendingFeeOptions = useMemo(
    () =>
      (fees.data ?? [])
        .map((f) => {
          const pending = f.totalAmount - f.amountPaid;
          if (pending <= 0) return null;
          return {
            value: f.id,
            label: `${f.student.lastName}, ${f.student.firstName} · ${f.yearMonth} · pend. ${formatMoney(pending)}`,
          };
        })
        .filter(Boolean) as { value: string; label: string }[],
    [fees.data],
  );

  async function submitPayFee() {
    try {
      const data = await payFee.mutateAsync();
      setPayOpen(false);
      if (data?.id) {
        const ok = await confirm({
          title: "Recibo de cobro",
          description: "¿Descargar recibo del cobro?",
          confirmLabel: "Descargar",
        });
        if (ok) {
          window.open(downloadUrl(`/reports/receipts/student-payment/${data.id}`), "_blank");
        }
      }
    } catch {
      /* mutation error surfaces via payFee.isError if needed */
    }
  }

  async function confirmVoidPayment(paymentId: string) {
    const ok = await confirm({
      title: "Anular cobro",
      description: "¿Anular este cobro?",
      confirmLabel: "Anular",
      destructive: true,
    });
    if (!ok) return;
    setDeleteError(null);
    try {
      await deletePayment.mutateAsync(paymentId);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "No se pudo anular el cobro");
    }
  }

  return (
    <WorkspaceShell
      title="Control de pagos"
      description="Cobros de alumnos y liquidaciones a profesores"
      actions={
        isAdmin ? (
          <div className="flex flex-wrap gap-2">
            {section === "students" ? (
              <>
                <Button size="sm" onClick={() => setPayOpen(true)}>
                  Registrar cobro
                </Button>
                <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
                  <Layers className="h-4 w-4" /> Cuotas del mes
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={genPayouts.isPending}
                onClick={() => genPayouts.mutate()}
              >
                Generar liquidaciones ({monthTo})
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {confirmDialog}
      <EntityDetailSheet
        open={!!sheetFee}
        onOpenChange={(o) => !o && setSelectedFeeId(null)}
        size="lg"
        title={
          sheetFee
            ? `${sheetFee.student.lastName}, ${sheetFee.student.firstName}`
            : "Cuota"
        }
        description={sheetFee?.yearMonth}
      >
        {sheetFee ? (
          <StudentFeeDetailPanel
            key={`${sheetFee.id}-${sheetFee.amountPaid}-${sheetFee.payments.length}`}
            fee={sheetFee}
            onClose={() => setSelectedFeeId(null)}
            onDeleted={() => setSelectedFeeId(null)}
          />
        ) : null}
      </EntityDetailSheet>
      <EntityDetailSheet
        open={!!sheetPayout}
        onOpenChange={(o) => !o && setSelectedPayoutId(null)}
        size="lg"
        title={
          sheetPayout
            ? `${sheetPayout.teacher.lastName}, ${sheetPayout.teacher.firstName}`
            : "Liquidación"
        }
        description={sheetPayout?.yearMonth}
      >
        {sheetPayout ? (
          <TeacherPayoutDetailPanel
            key={`${sheetPayout.id}-${sheetPayout.amountPaid}`}
            payout={sheetPayout}
            onClose={() => setSelectedPayoutId(null)}
            onDeleted={() => setSelectedPayoutId(null)}
          />
        ) : null}
      </EntityDetailSheet>
      {isAdmin ? (
        <BulkFeeGenerateDialog open={bulkOpen} onOpenChange={setBulkOpen} defaultMonth={monthTo} />
      ) : null}
      {deleteError ? (
        <Alert variant="destructive">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <ListToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar por nombre…">
          <FilterField label="Mes desde">
            <MonthSelect value={monthFrom} onChange={setMonthFrom} />
          </FilterField>
          <FilterField label="Mes hasta">
            <MonthSelect value={monthTo} onChange={setMonthTo} />
          </FilterField>
          {section === "students" ? (
            <FilterField label="Estado cuota">
              <FormSelect
                value={feeStatus || ALL_FILTER}
                onValueChange={(v) => setFeeStatus(v === ALL_FILTER ? "" : v)}
                options={FEE_STATUS_FILTER}
              />
            </FilterField>
          ) : (
            <FilterField label="Estado liquidación">
              <FormSelect
                value={payoutStatus || ALL_FILTER}
                onValueChange={(v) => setPayoutStatus(v === ALL_FILTER ? "" : v)}
                options={PAYOUT_STATUS_FILTER}
              />
            </FilterField>
          )}
        </ListToolbar>

        <div className="border-b border-border px-4 py-3">
          <SegmentedControl
            value={section}
            onChange={setSection}
            options={[
              { value: "students", label: "Cobros de alumnos" },
              { value: "teachers", label: "Pagos a profesores" },
            ]}
          />
        </div>

        {section === "students" ? (
          <CardContent className="space-y-4 pt-6">
            <Dialog open={payOpen} onOpenChange={setPayOpen}>
              <DialogContent size="md">
                <DialogHeader>
                  <DialogTitle>Registrar cobro</DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground">
                  Pendiente:{" "}
                  <span className="font-medium text-foreground">
                    {selectedFee
                      ? `${selectedFee.student.lastName}, ${selectedFee.student.firstName} (${selectedFee.yearMonth}) — ${formatMoney(pendingSelected)}`
                      : "Selecciona una cuota"}
                  </span>
                </p>
                <div className="grid gap-3">
                  <div className="space-y-1">
                    <Label>Cuota</Label>
                    <FormSelect
                      value={payFeeId}
                      onValueChange={(id) => {
                        setPayFeeId(id);
                        const f = fees.data?.find((x) => x.id === id);
                        if (f) selectFee(f);
                      }}
                      options={pendingFeeOptions}
                      placeholder="Seleccionar alumno y mes…"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
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
                      <FormSelect
                        value={payMethod}
                        onValueChange={setPayMethod}
                        options={METHOD_OPTIONS}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter className="pt-2">
                  <Button variant="outline" size="sm" onClick={() => setPayOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    disabled={!payFeeId || !payAmount || payFee.isPending}
                    onClick={() => void submitPayFee()}
                  >
                    Registrar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <DataTable maxBodyHeight="min(42vh, 440px)">
              <DataTableHead>
                <DataTableTh>Alumno</DataTableTh>
                <DataTableTh>Mes</DataTableTh>
                <DataTableTh>Total</DataTableTh>
                <DataTableTh>Pagado</DataTableTh>
                <DataTableTh>Pendiente</DataTableTh>
                <DataTableTh>Estado</DataTableTh>
              </DataTableHead>
              <tbody>
                {feePagination.slice.map((f) => {
                  const pending = f.totalAmount - f.amountPaid;
                  return (
                    <DataTableRow
                      key={f.id}
                      className={selectedFeeId === f.id ? "bg-primary/5" : undefined}
                      onClick={() => setSelectedFeeId(f.id)}
                    >
                      <DataTableTd className="font-medium">
                        {f.student.lastName}, {f.student.firstName}
                      </DataTableTd>
                      <DataTableTd>{f.yearMonth}</DataTableTd>
                      <DataTableTd>{formatMoney(f.totalAmount)}</DataTableTd>
                      <DataTableTd>{formatMoney(f.amountPaid)}</DataTableTd>
                      <DataTableTd>{formatMoney(pending)}</DataTableTd>
                      <DataTableTd>
                        <Badge variant={feeStatusBadge(f.status)}>
                          {FEE_STATUS_LABELS[f.status]}
                        </Badge>
                      </DataTableTd>
                    </DataTableRow>
                  );
                })}
              </tbody>
            </DataTable>
            <TablePagination
              page={feePagination.page}
              totalPages={feePagination.totalPages}
              totalItems={feePagination.totalItems}
              pageSize={feePagination.pageSize}
              onPageChange={feePagination.setPage}
            />

            {fees.data?.some((f) => f.payments.length > 0) ? (
              <CollapsibleSection
                className="mx-4 mb-4"
                title="Detalle de cobros en el periodo"
                description="Expandir solo cuando necesites revisar cobros"
              >
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
                                    onClick={() => void confirmVoidPayment(p.id)}
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
              </CollapsibleSection>
            ) : null}
          </CardContent>
        ) : (
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-muted-foreground">
              Liquidaciones del periodo · mes de referencia hasta {monthTo}
            </p>
            <DataTable maxBodyHeight="min(42vh, 440px)">
              <DataTableHead>
                <DataTableTh>Profesor</DataTableTh>
                <DataTableTh>Mes</DataTableTh>
                <DataTableTh>Base</DataTableTh>
                <DataTableTh>Transporte</DataTableTh>
                <DataTableTh>Total</DataTableTh>
                <DataTableTh>Pagado</DataTableTh>
                <DataTableTh>Estado</DataTableTh>
              </DataTableHead>
              <tbody>
                {payoutPagination.slice.map((p) => (
                  <DataTableRow
                    key={p.id}
                    className={selectedPayoutId === p.id ? "bg-primary/5" : undefined}
                    onClick={() => setSelectedPayoutId(p.id)}
                  >
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
                      <Badge variant={feeStatusBadge(p.status)}>
                        {PAYOUT_STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                      {p.paidAt ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {formatDate(p.paidAt)}
                        </span>
                      ) : null}
                    </DataTableTd>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTable>
            <TablePagination
              page={payoutPagination.page}
              totalPages={payoutPagination.totalPages}
              totalItems={payoutPagination.totalItems}
              pageSize={payoutPagination.pageSize}
              onPageChange={payoutPagination.setPage}
            />
          </CardContent>
        )}
      </Card>
    </WorkspaceShell>
  );
}
