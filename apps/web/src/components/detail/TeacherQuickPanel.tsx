import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";

export function TeacherQuickPanel({ teacherId }: { teacherId: string }) {
  const teacher = useQuery({
    queryKey: ["teacher", teacherId],
    queryFn: () =>
      api<{
        firstName: string;
        lastName: string;
        email?: string | null;
        phone?: string | null;
        specialty?: string | null;
        hourlyRate: number;
        classGroups: Array<{ name: string }>;
        payouts?: Array<{ yearMonth: string; amount: number; status: string }>;
      }>(`/teachers/${teacherId}`),
  });

  if (teacher.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!teacher.data) return <p className="text-sm text-muted-foreground">No se pudo cargar.</p>;

  const t = teacher.data;
  const latestPayout = t.payouts?.[0];

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid gap-2">
        <Row label="Email" value={t.email ?? "—"} />
        <Row label="Teléfono" value={t.phone ?? "—"} />
        <Row label="Especialidad" value={t.specialty ?? "—"} />
        <Row label="Tarifa/h" value={formatMoney(t.hourlyRate)} />
        <Row label="Clases" value={String(t.classGroups?.length ?? 0)} />
      </dl>
      {latestPayout ? (
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">Última liquidación</p>
          <p className="font-medium">
            {latestPayout.yearMonth} · {formatMoney(latestPayout.amount)}
          </p>
        </div>
      ) : null}
      <Button asChild className="w-full" size="sm">
        <Link to={`/profesores/${teacherId}`}>Abrir ficha completa</Link>
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
