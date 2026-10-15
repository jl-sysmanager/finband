import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { toast } from "@/stores/toast";

/** Errores que no mejoran reintentando. */
const NO_RETRY_STATUS = new Set([400, 401, 403, 404, 409]);

function handleError(error: unknown) {
  if (error instanceof ApiError && error.status === 401 && useAuth.getState().user) {
    toast("La sesión ha caducado. Vuelva a iniciar sesión.", "error");
    useAuth.getState().expireSession();
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleError }),
  mutationCache: new MutationCache({ onError: handleError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) =>
        !(error instanceof ApiError && NO_RETRY_STATUS.has(error.status)) && failureCount < 2,
    },
  },
});

// Al cerrar sesión (o caducar) no debe quedar nada del usuario anterior en caché:
// en un ordenador compartido lo vería el siguiente.
useAuth.subscribe((state, prev) => {
  if (prev.user && !state.user) queryClient.clear();
});
