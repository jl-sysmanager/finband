import { useMemo, useState } from "react";

/**
 * Paginación en cliente. `resetKey` resume los filtros activos: cuando cambia,
 * se vuelve a la primera página (si no, un filtro nuevo podía dejar al usuario
 * en una página vacía o a mitad de resultados).
 */
export function usePagination<T>(items: T[], pageSize = 15, resetKey?: unknown) {
  const [state, setState] = useState({ page: 1, key: resetKey });
  const page = Object.is(state.key, resetKey) ? state.page : 1;
  if (!Object.is(state.key, resetKey)) {
    // Ajuste durante el render (patrón recomendado por React para estado derivado).
    setState({ page: 1, key: resetKey });
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  const safePage = Math.min(page, totalPages);

  const slice = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  function goTo(p: number) {
    setState({ page: Math.max(1, Math.min(totalPages, p)), key: resetKey });
  }

  function reset() {
    setState({ page: 1, key: resetKey });
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
