import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type DetailTab = { id: string; label: string; content: ReactNode };

type Props = {
  backTo: string;
  backLabel?: string;
  title: string;
  subtitle?: ReactNode;
  headerActions?: ReactNode;
  footerActions?: ReactNode;
  children?: ReactNode;
  tabs?: DetailTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
};

export function DetailPageLayout({
  backTo,
  backLabel = "Volver",
  title,
  subtitle,
  headerActions,
  tabs,
  activeTab,
  onTabChange,
  footerActions,
  children,
}: Props) {
  return (
    <div className="page-container pb-20 md:pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2 h-8" asChild>
            <Link to={backTo}>
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          </Button>
          <div>
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
            {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
          </div>
        </div>
        {headerActions ? <div className="flex flex-wrap gap-2">{headerActions}</div> : null}
      </div>

      {tabs && activeTab && onTabChange ? (
        <Tabs value={activeTab} onValueChange={onTabChange} className="mt-6">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 md:w-auto">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id}>
              {t.content}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="mt-6">{children}</div>
      )}

      {footerActions ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-card/95 p-4 backdrop-blur md:static md:mt-6 md:border-0 md:bg-transparent md:p-0",
          )}
        >
          {footerActions}
        </div>
      ) : null}
    </div>
  );
}
