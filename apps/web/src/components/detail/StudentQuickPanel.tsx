import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { FEE_STATUS_LABELS } from "@finband/shared";

export function StudentQuickPanel({ studentId }: { studentId: string }) {
  const student = useQuery({
    queryKey: ["student", studentId],
    queryFn: () =>
      api<{
        firstName: string;
        lastName: string;
        email?: string | null;
        phone?: string | null;
        mainInstrument?: string | null;
        level?: string | null;
        status: string;
        primaryTeacher?: { firstName: string; lastName: string } | null;
        fees?: Array<{
          yearMonth: string;
          totalAmount: number;
          amountPaid: number;
          status: keyof typeof FEE_STATUS_LABELS;
        }>;
      }>(`/students/${studentId}`),
  });

  if (student.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!student.data) return <p className="text-sm text-muted-foreground">No se pudo cargar.</p>;

  const s = student.data;
  const latestFee = s.fees?.[0];

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid gap-2">
        <Row label="Email" value={s.email ?? "—"} />
        <Row label="Teléfono" value={s.phone ?? "—"} />
        <Row label="Instrumento" value={s.mainInstrument ?? "—"} />
        <Row label="Nivel" value={s.level ?? "—"} />
        <Row
          label="Profesor"
          value={
            s.primaryTeacher
              ? `${s.primaryTeacher.firstName} ${s.primaryTeacher.lastName}`
              : "—"
          }
        />
        <div className="flex items-center gap-2">
          <dt className="text-muted-foreground">Estado</dt>
          <dd>
            <Badge variant={s.status === "ACTIVE" ? "success" : "secondary"}>
              {s.status === "ACTIVE" ? "Activo" : "Inactivo"}
            </Badge>
          </dd>
        </div>
      </dl>
      {latestFee ? (
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">Última cuota</p>
          <p className="font-medium">
            {latestFee.yearMonth} · {formatMoney(latestFee.amountPaid)} /{" "}
            {formatMoney(latestFee.totalAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {FEE_STATUS_LABELS[latestFee.status]}
          </p>
        </div>
      ) : null}
      <Button asChild className="w-full" size="sm">
        <Link to={`/alumnos/${studentId}`}>Abrir ficha completa</Link>
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
