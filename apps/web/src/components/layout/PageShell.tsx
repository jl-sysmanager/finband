import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/list/PageHeader";
import { cn } from "@/lib/utils";

type HeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

/** Listados con tabla en card */
export function ListShell({
  title,
  description,
  actions,
  toolbar,
  footer,
  children,
  className,
}: HeaderProps & {
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("page-container", className)}>
      <PageHeader title={title} description={description} actions={actions} />
      <Card className="overflow-hidden shadow-card">
        {toolbar}
        <CardContent className={toolbar ? "p-0 pt-0" : "p-0"}>{children}</CardContent>
        {footer ? (
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{footer}</div>
        ) : null}
      </Card>
    </div>
  );
}

/** Dashboard, pagos, informes — contenido libre en secciones */
export function WorkspaceShell({
  title,
  description,
  actions,
  toolbar,
  children,
  className,
}: HeaderProps & {
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("page-container", className)}>
      <PageHeader title={title} description={description} actions={actions} />
      {toolbar ? <div className="rounded-xl border border-border bg-card p-3 shadow-sm">{toolbar}</div> : null}
      <div className="section-stack">{children}</div>
    </div>
  );
}

/** Bloque workspace con card opcional */
export function WorkspaceSection({
  children,
  className,
  inset,
}: {
  children: ReactNode;
  className?: string;
  inset?: boolean;
}) {
  if (inset) {
    return <Card className={cn("shadow-card", className)}>{children}</Card>;
  }
  return <div className={className}>{children}</div>;
}
