import { cn } from "@/lib/utils";

export function HeroStat({
  label,
  value,
  sub,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "default" | "income" | "expense" | "primary" | "pending";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card p-4 shadow-sm",
        tone === "primary" && "border-primary/25 bg-gradient-to-br from-primary/10 to-card",
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums tracking-tight md:text-3xl",
          tone === "income" && "text-income",
          tone === "expense" && "text-expense",
          tone === "pending" && "text-pending",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
