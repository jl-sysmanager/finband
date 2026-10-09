import { useMemo, useState } from "react";

export function usePagination<T>(items: T[], pageSize = 15) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  const safePage = Math.min(page, totalPages);

  const slice = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  function goTo(p: number) {
    setPage(Math.max(1, Math.min(totalPages, p)));
  }

  function reset() {
    setPage(1);
  }

  return {
    page: safePage,
    pageSize,
    totalPages,
    totalItems: items.length,
    slice,
    setPage: goTo,
    reset,
  };
}
