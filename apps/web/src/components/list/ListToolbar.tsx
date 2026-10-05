import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  children?: ReactNode;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  className?: string;
};

export function ListToolbar({
  children,
  search,
  onSearchChange,
  searchPlaceholder = "Buscar…",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border px-6 py-4 md:flex-row md:flex-wrap md:items-end",
        className,
      )}
    >
      {onSearchChange ? (
        <div className="relative min-w-[200px] flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm"
          />
        </div>
      ) : null}
      {children}
    </div>
  );
}
