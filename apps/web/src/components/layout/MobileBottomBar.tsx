import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MobileBottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-card/95 p-3 backdrop-blur md:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
