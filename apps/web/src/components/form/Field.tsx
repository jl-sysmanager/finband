import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Etiqueta + control enlazados (`htmlFor`/`id`): el lector de pantalla anuncia la
 * etiqueta y al pulsarla se enfoca el control. El control debe aceptar `id`.
 */
export function Field({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactElement<{ id?: string }>;
}) {
  const autoId = useId();
  const id = children.props.id ?? autoId;
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, { id })}
    </div>
  );
}
