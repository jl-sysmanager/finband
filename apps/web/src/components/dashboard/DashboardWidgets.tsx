import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { type ReactNode } from "react";
import { cn, formatMoney } from "@/lib/utils";

export type OperativeTone = "ok" | "warn" | "alert" | "info";

const TONE_STYLES: Record<
  OperativeTone,
  { card: string; badge: string; value: string; icon: string }
> = {
  ok: {
    card: "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-card",
    badge: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
    value: "text-emerald-700 dark:text-emerald-300",
    icon: "text-emerald-600",
  },
  warn: {
    card: "border-amber-500/40 bg-gradient-to-br from-amber-500/12 to-card",
    badge: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
    value: "text-amber-800 dark:text-amber-200",
    icon: "text-amber-600",
  },
  alert: {
    card: "border-rose-500/40 bg-gradient-to-br from-rose-500/10 to-card shadow-md shadow-rose-500/5",
    badge: "bg-rose-500/15 text-rose-900 dark:text-rose-100",
    value: "text-rose-700 dark:text-rose-300",
    icon: "text-rose-600",
  },
  info: {
    card: "border-sky-500/35 bg-gradient-to-br from-sky-500/10 to-card",
    badge: "bg-sky-500/15 text-sky-900 dark:text-sky-100",
    value: "text-sky-800 dark:text-sky-200",
    icon: "text-sky-600",
  },
};

export function OperativeTile({
  icon,
  label,
  count,
  detail,
  detailLabel,
  to,
  tone,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  detail?: string;
  detailLabel?: string;
  to: string;
  tone: OperativeTone;
}) {
  const styles = TONE_STYLES[tone];
  const statusLabel =
    tone === "ok" ? "Al día" : tone === "alert" ? "Urgente" : tone === "warn" ? "Revisar" : "Completar";

  return (
    <Link
      to={to}
      className={cn(
        "group flex min-h-[8.5rem] flex-col justify-between rounded-2xl border-2 p-4 transition hover:scale-[1.01] hover:shadow-lg",
        styles.card,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("rounded-lg bg-card/60 p-2 shadow-sm", styles.icon)}>{icon}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", styles.badge)}>
          {statusLabel}
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-foreground/90">{label}</p>
        <p className={cn("mt-1 text-4xl font-bold tabular-nums tracking-tight", styles.value)}>{count}</p>
        {detail ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {detailLabel ? `${detailLabel}: ` : ""}
            <span className="font-medium text-foreground/80">{detail}</span>
          </p>
        ) : null}
      </div>
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-80 group-hover:opacity-100">
        Gestionar <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

export function FinanceChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "income" | "expense" | "pending" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        tone === "income" && "border-emerald-500/25 bg-emerald-500/5",
        tone === "expense" && "border-rose-500/25 bg-rose-500/5",
        tone === "pending" && "border-amber-500/30 bg-amber-500/8",
        tone === "neutral" && "border-border bg-muted/20",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "income" && "text-income",
          tone === "expense" && "text-expense",
          tone === "pending" && "text-pending",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function TotalBadge({
  count,
  amount,
  tone,
}: {
  count: number;
  amount: number;
  tone: "ok" | "warn" | "alert";
}) {
  const styles =
    tone === "ok"
      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
      : tone === "alert"
        ? "bg-rose-500/15 text-rose-800 dark:text-rose-200"
        : "bg-amber-500/15 text-amber-900 dark:text-amber-100";
  return (
    <div className={cn("rounded-lg px-2.5 py-1 text-right text-[10px] leading-tight", styles)}>
      <p className="font-bold tabular-nums">{count} reg.</p>
      <p className="font-semibold tabular-nums">{formatMoney(amount)}</p>
    </div>
  );
}

export function DashboardListRow({
  primary,
  secondary,
  amount,
  amountTone,
  to,
}: {
  primary: string;
  secondary?: string;
  amount: number;
  amountTone: "warn" | "alert" | "info";
  to: string;
}) {
  const amountClass =
    amountTone === "alert"
      ? "text-rose-600 dark:text-rose-400"
      : amountTone === "warn"
        ? "text-amber-700 dark:text-amber-300"
        : "text-sky-700 dark:text-sky-300";
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/15 px-2.5 py-2 text-sm transition hover:bg-muted/40"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{primary}</p>
        {secondary ? <p className="truncate text-xs text-muted-foreground">{secondary}</p> : null}
      </div>
      <span className={cn("shrink-0 font-semibold tabular-nums", amountClass)}>
        {formatMoney(amount)}
      </span>
    </Link>
  );
}

export function EmptyList({ message, tone }: { message: string; tone: "ok" }) {
  return (
    <p
      className={cn(
        "rounded-lg px-3 py-3 text-sm",
        tone === "ok" && "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
      )}
    >
      {message}
    </p>
  );
}

export function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 py-2 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
