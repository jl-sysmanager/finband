import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Field } from "@/components/form/Field";
import { MonthSelect } from "@/components/form/MonthSelect";
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
import { ApiError } from "@/lib/api";
import { invalidateFinanceQueries } from "@/lib/query-invalidation";
import { cn, currentYearMonth, formatMoney } from "@/lib/utils";
import { toast } from "@/stores/toast";

/** Fila de la vista previa: una persona y lo que se generaría para ella. */
export type BulkRow = {
  id: string;
  name: string;
  amount: number;
  /** ready = se puede generar; el resto se muestra sin poder elegirse. */
  issue: "ready" | "no_amount" | "has_payments";
  /** Detalle bajo el nombre (método, sesiones, cuota nueva o recalculada…). */
  detail?: string;
  /** Aviso a revisar (p. ej. sin clases en el horario). */
  warning?: string;
};

type Nouns = { one: string; many: string };

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[m! - 1]} de ${y}`;
};

/**
 * Generación en bloque (cuotas o liquidaciones) de un mes: vista previa, selección
 * de personas y confirmación antes de generar. Solo se envían los elegidos.
 */
export function BulkGenerateDialog({
  open,
  onOpenChange,
  title,
  defaultMonth,
  nouns,
  queryKey,
  fetchRows,
  generate,
  issueLabels,
  recalcNote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  defaultMonth?: string;
  nouns: Nouns;
  queryKey: string;
  fetchRows: (yearMonth: string) => Promise<BulkRow[]>;
  generate: (yearMonth: string, ids: string[]) => Promise<string>;
  issueLabels: Record<Exclude<BulkRow["issue"], "ready">, string>;
  /** Aviso en la confirmación sobre lo que ya existía. */
  recalcNote: string;
}) {
  const qc = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [yearMonth, setYearMonth] = useState(defaultMonth ?? currentYearMonth());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Selección ligada al mes: al cambiar de mes vuelve a "todos los que se pueden".
  const [picked, setPicked] = useState<{ month: string; ids: Set<string> } | null>(null);

  const preview = useQuery({
    queryKey: [queryKey, yearMonth],
    queryFn: () => fetchRows(yearMonth),
    enabled: open,
  });
  const rows = useMemo(() => preview.data ?? [], [preview.data]);
  const readyIds = useMemo(() => rows.filter((r) => r.issue === "ready").map((r) => r.id), [rows]);
  const selected = picked?.month === yearMonth ? picked.ids : new Set(readyIds);
  const setSelected = (ids: Set<string>) => setPicked({ month: yearMonth, ids });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const chosen = rows.filter((r) => r.issue === "ready" && selected.has(r.id));
  const total = chosen.reduce((t, r) => t + Math.round(r.amount * 100), 0) / 100;
  const blocked = rows.length - readyIds.length;

  const run = useMutation({
    mutationFn: (ids: string[]) => generate(yearMonth, ids),
    onSuccess: (message) => {
      toast(message, "success");
      void invalidateFinanceQueries(qc);
      setPicked(null);
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "No se pudo generar"),
  });

  async function confirmAndGenerate() {
    setError(null);
    const n = chosen.length;
    const ok = await confirm({
      title: `Generar ${n === 1 ? nouns.one : nouns.many}`,
      description: `Se ${n === 1 ? "generará 1" : `generarán ${n}`} ${n === 1 ? nouns.one : nouns.many} de ${monthLabel(yearMonth)} por un total de ${formatMoney(total)}. ${recalcNote}`,
      confirmLabel: "Generar",
    });
    if (ok) run.mutate(chosen.map((r) => r.id));
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <>
      {confirmDialog}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Mes">
              <MonthSelect value={yearMonth} onChange={setYearMonth} />
            </Field>
            <Field label="Buscar" className="min-w-[180px] flex-1">
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre…"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="outline" onClick={() => setSelected(new Set(readyIds))}>
                Todos
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setSelected(new Set())}>
                Ninguno
              </Button>
            </div>
            <p className="text-muted-foreground">
              {chosen.length} de {readyIds.length} seleccionados
              {blocked > 0 ? ` · ${blocked} no se pueden generar` : ""}
            </p>
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border text-sm">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/90 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 p-2">
                    <span className="sr-only">Incluir</span>
                  </th>
                  <th className="p-2">Nombre</th>
                  <th className="p-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {preview.isLoading ? (
                  <tr>
                    <td colSpan={3} className="p-3 text-muted-foreground">
                      Calculando…
                    </td>
                  </tr>
                ) : preview.isError ? (
                  <tr>
                    <td colSpan={3} className="p-3 text-destructive">
                      No se pudo cargar la vista previa.
                    </td>
                  </tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-3 text-muted-foreground">
                      No hay resultados.
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => {
                    const ready = r.issue === "ready";
                    return (
                      <tr key={r.id} className={cn("border-t border-border/60", !ready && "text-muted-foreground")}>
                        <td className="p-2 align-top">
                          <input
                            type="checkbox"
                            checked={ready && selected.has(r.id)}
                            disabled={!ready}
                            onChange={() => toggle(r.id)}
                            aria-label={`Incluir ${r.name}`}
                            className="accent-primary"
                          />
                        </td>
                        <td className="p-2">
                          <span className="block">{r.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {r.issue === "ready" ? r.detail : issueLabels[r.issue]}
                          </span>
                          {r.warning ? (
                            <span className="block text-xs font-medium text-warning">⚠ {r.warning}</span>
                          ) : null}
                        </td>
                        <td className="p-2 text-right align-top tabular-nums">
                          {ready ? formatMoney(r.amount) : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter className="items-center gap-2 pt-2 sm:justify-between">
            <p className="text-sm">
              Total: <span className="font-semibold">{formatMoney(total)}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={run.isPending || chosen.length === 0}
                onClick={() => void confirmAndGenerate()}
              >
                {run.isPending
                  ? "Generando…"
                  : `Generar ${chosen.length} ${chosen.length === 1 ? nouns.one : nouns.many}`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
