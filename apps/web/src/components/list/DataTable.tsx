import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTable({
  children,
  className,
  maxBodyHeight,
}: {
  children: ReactNode;
  className?: string;
  /** Limit vertical scroll inside long lists */
  maxBodyHeight?: string;
}) {
  return (
    <div
      className={cn("overflow-x-auto", maxBodyHeight && "overflow-y-auto", className)}
      style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
    >
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-card">
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
  return <th className={cn("px-3 py-2 font-medium", className)}>{children}</th>;
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
        onClick &&
          "cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
        className,
      )}
      onClick={onClick}
      // Filas que abren un detalle: también con teclado (Tab + Intro/Espacio).
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}

export function DataTableTd({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLTableCellElement>;
}) {
  return (
    <td className={cn("px-3 py-2 align-middle", className)} onClick={onClick}>
      {children}
    </td>
  );
}

export function DataTableActions({ children }: { children: ReactNode }) {
  return (
    <DataTableTd className="text-right">
      <div className="flex justify-end gap-1">{children}</div>
    </DataTableTd>
  );
}
