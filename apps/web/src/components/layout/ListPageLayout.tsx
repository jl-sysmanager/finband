import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/list/PageHeader";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function ListPageLayout({
  title,
  description,
  actions,
  toolbar,
  footer,
  children,
}: Props) {
  return (
    <div className="page-container">
      <PageHeader title={title} description={description} actions={actions} />
      <Card className="overflow-hidden">
        {toolbar}
        <CardContent className={toolbar ? "p-0 pt-0" : "p-0"}>{children}</CardContent>
        {footer ? (
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{footer}</div>
        ) : null}
      </Card>
    </div>
  );
}
