import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FEE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@finband/shared";
import { FileText, Layers, Trash2 } from "lucide-react";
import { EntityDetailSheet } from "@/components/layout/EntityDetailSheet";
import { StudentFeeDetailPanel, type StudentFeeRow } from "@/components/detail/StudentFeeDetailPanel";
import { TeacherPayoutDetailPanel, type PayoutRow } from "@/components/detail/TeacherPayoutDetailPanel";
import { BulkFeeGenerateDialog } from "@/components/fees/BulkFeeGenerateDialog";
import { BulkPayoutGenerateDialog } from "@/components/payouts/BulkPayoutGenerateDialog";
import { useMemo, useState } from "react";
import { CollapsibleSection } from "@/components/list/CollapsibleSection";
import { TablePagination } from "@/components/list/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import { FormSelect } from "@/components/form/FormSelect";
import { MonthSelect } from "@/components/form/MonthSelect";
import { useConfirm } from "@/hooks/useConfirm";
import { FilterField } from "@/components/list/FilterField";
import { ListToolbar } from "@/components/list/ListToolbar";
import { WorkspaceShell } from "@/components/layout/PageShell";
import { SegmentedControl } from "@/components/layout/SegmentedControl";
import { feeStatusBadge } from "@/lib/status";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError, api, downloadUrl } from "@/lib/api";
import { RegisterPaymentDialog } from "@/components/payments/RegisterPaymentDialog";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { invalidateFinanceQueries } from "@/lib/query-invalidation";
import { buildQuery, currentYearMonth, formatDate, formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

type StudentFee = StudentFeeRow;

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


export function PaymentsPage() {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const qc = useQueryClient();
  const [section, setSection] = useState<"students" | "teachers">("students");
  const [monthFrom, setMonthFrom] = useState(currentYearMonth());
  const [monthTo, setMonthTo] = useState(currentYearMonth());
  const [search, setSearch] = useState("");
  const [feeStatus, setFeeStatus] = useState("");
  const [payoutStatus, setPayoutStatus] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [payoutBulkOpen, setPayoutBulkOpen] = useState(false);
  const [selectedFeeId, setSelectedFeeId] = useState<string | null>(null);
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const debouncedSearch = useDebouncedValue(search.trim());

  const feeQuery = buildQuery({
    monthFrom,
    monthTo,
    search: debouncedSearch || undefined,
    status: feeStatus || undefined,
  });

  const payoutQuery = buildQuery({
    monthFrom,
    monthTo,
    search: debouncedSearch || undefined,
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

  const sheetFee = useMemo(
    () => fees.data?.find((f) => f.id === selectedFeeId) ?? null,
    [fees.data, selectedFeeId],
  );

  const sheetPayout = useMemo(
    () => payouts.data?.find((p) => p.id === selectedPayoutId) ?? null,
    [payouts.data, selectedPayoutId],
  );

  const deletePayment = useMutation({
    mutationFn: (id: string) => api(`/payments/student-payments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateFinanceQueries(qc);
      setDeleteError(null);
    },
  });

  const feeRows = fees.data ?? [];
  const feePagination = usePagination(feeRows, 10, feeQuery);
  const payoutPagination = usePagination(payouts.data ?? [], 10, payoutQuery);

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
                <Button
                  size="sm"
                  onClick={() => setPayOpen(true)}
                >
                  Registrar cobro
                </Button>
                <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
                  <Layers className="h-4 w-4" /> Cuotas del mes
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setPayoutBulkOpen(true)}>
                <Layers className="h-4 w-4" /> Generar liquidaciones
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
            key={sheetFee.id}
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
            key={sheetPayout.id}
            payout={sheetPayout}
            onClose={() => setSelectedPayoutId(null)}
            onDeleted={() => setSelectedPayoutId(null)}
          />
        ) : null}
      </EntityDetailSheet>
      {isAdmin ? (
        <>
          <BulkFeeGenerateDialog open={bulkOpen} onOpenChange={setBulkOpen} defaultMonth={monthTo} />
          <BulkPayoutGenerateDialog
            open={payoutBulkOpen}
            onOpenChange={setPayoutBulkOpen}
            defaultMonth={monthTo}
          />
        </>
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
            <RegisterPaymentDialog open={payOpen} onOpenChange={setPayOpen} fees={feeRows} />

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
                                    aria-label="Descargar recibo"
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
                                    aria-label="Anular cobro"
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
