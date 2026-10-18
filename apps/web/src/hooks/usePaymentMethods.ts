import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";

export type PaymentMethodItem = {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
  uses: number;
};

/**
 * Métodos de pago configurados en Configuración. Los formularios ofrecen los
 * activos (más el que ya tenga el registro que se edita, aunque esté desactivado)
 * y los listados muestran su nombre actual.
 */
export function usePaymentMethods() {
  const query = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => api<PaymentMethodItem[]>("/settings/payment-methods"),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    const methods = query.data ?? [];
    const byId = new Map(methods.map((m) => [m.id, m]));
    return {
      methods,
      isLoading: query.isLoading,
      /** Primer método activo: valor por defecto de un cobro nuevo. */
      defaultId: methods.find((m) => m.active)?.id ?? "",
      labelOf: (id: string | null | undefined) => (id ? (byId.get(id)?.label ?? id) : "—"),
      options: (current?: string | null) =>
        methods
          .filter((m) => m.active || m.id === current)
          .map((m) => ({ value: m.id, label: m.active ? m.label : `${m.label} (desactivado)` })),
    };
  }, [query.data, query.isLoading]);
}
