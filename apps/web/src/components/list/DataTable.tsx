import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-border text-left text-muted-foreground">{children}</tr>
    </thead>
  );
}

export function DataTableTh({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <th className={cn("pb-2 pr-3 font-medium", className)}>{children}</th>;
}

export function DataTableRow({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      className={cn(
        "border-b border-border/60 transition-colors hover:bg-muted/40",
        onClick && "cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function DataTableTd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn("py-2 pr-3 align-middle", className)}>{children}</td>;
}
