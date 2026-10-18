import { ConfigListManager } from "@/components/settings/ConfigListManager";
import type { PaymentMethodItem } from "@/hooks/usePaymentMethods";

type CategoryRow = { id: string; name: string; entries: number; managedByApp: boolean };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function categoryItem(row: CategoryRow) {
  return {
    id: row.id,
    name: row.name,
    usage: plural(row.entries, "apunte", "apuntes"),
    badge: row.managedByApp ? "Gestionada por la app" : undefined,
    deleteBlockedReason: row.managedByApp
      ? "La gestiona la app: se puede renombrar, no borrar"
      : row.entries > 0
        ? "Tiene apuntes: cámbielos de categoría antes de borrarla"
        : "",
  };
}

/** Listas que usan los ingresos, gastos y cobros (categorías y métodos de pago). */
export function ConfigListsTab({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ConfigListManager<PaymentMethodItem>
        title="Métodos de pago"
        description="Se ofrecen al registrar cobros de cuotas e ingresos. Los que ya se han usado no se borran: se desactivan."
        endpoint="/settings/payment-methods"
        queryKey="payment-methods"
        nameField="label"
        supportsActive
        canEdit={canEdit}
        addPlaceholder="Nuevo método de pago"
        toItem={(m) => ({
          id: m.id,
          name: m.label,
          usage: plural(m.uses, "uso", "usos"),
          active: m.active,
          deleteBlockedReason: m.uses > 0 ? "Ya se ha usado: desactívelo en su lugar" : "",
        })}
      />
      <ConfigListManager<CategoryRow>
        title="Categorías de ingresos"
        description="Clasifican los apuntes de Ingresos. El orden es el de los formularios."
        endpoint="/settings/income-categories"
        queryKey="income-categories"
        nameField="name"
        canEdit={canEdit}
        addPlaceholder="Nueva categoría de ingresos"
        toItem={categoryItem}
      />
      <ConfigListManager<CategoryRow>
        title="Categorías de gastos"
        description="Clasifican los apuntes de Gastos."
        endpoint="/settings/expense-categories"
        queryKey="expense-categories"
        nameField="name"
        canEdit={canEdit}
        addPlaceholder="Nueva categoría de gastos"
        toItem={categoryItem}
      />
    </div>
  );
}
