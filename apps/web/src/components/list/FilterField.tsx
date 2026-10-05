import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  children: ReactNode;
  className?: string;
};

export function FilterField({ label, children, className }: Props) {
  return (
    <div className={cn("space-y-1 min-w-[140px]", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
