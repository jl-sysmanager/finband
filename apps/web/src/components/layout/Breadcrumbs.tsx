import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { BreadcrumbItem } from "@/lib/route-meta";

export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("flex flex-wrap items-center gap-1 text-sm", className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
            {i > 0 ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
            {item.to && !isLast ? (
              <Link to={item.to} className="text-muted-foreground hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-foreground" : "text-muted-foreground"}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
