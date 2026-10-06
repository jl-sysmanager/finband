import type { UseQueryResult } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/EmptyState";
import { ApiError } from "@/lib/api";

type Props<T> = {
  query: Pick<UseQueryResult<T>, "isLoading" | "isError" | "error" | "data">;
  empty?: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
};

export function QueryState<T>({
  query,
  empty,
  emptyIcon,
  emptyTitle = "Sin resultados",
  emptyDescription,
  emptyAction,
  skeleton,
  children,
}: Props<T>) {
  if (query.isLoading) {
    return (
      skeleton ?? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      )
    );
  }

  if (query.isError) {
    const msg =
      query.error instanceof ApiError ? query.error.message : "Error al cargar los datos";
    return (
      <Alert variant="destructive" className="m-4">
        <AlertDescription>{msg}</AlertDescription>
      </Alert>
    );
  }

  if (query.data === undefined || query.data === null) return null;

  if (empty) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return <>{children(query.data)}</>;
}
