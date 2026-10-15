import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Teacher = { id: string; firstName: string; lastName: string };

/**
 * Selector nativo de profesor para formularios no controlados.
 * Hasta que llega la lista no se pinta el `select`: si se pintara vacío, el
 * navegador fijaría "—" y al guardar se borraría el profesor asignado.
 */
export function TeacherSelect({
  name,
  defaultValue,
  disabled,
  id,
  required,
  emptyLabel = "—",
}: {
  name: string;
  defaultValue?: string | null;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  /** Texto de la opción vacía ("—" si es opcional, "Seleccionar…" si es obligatorio). */
  emptyLabel?: string;
}) {
  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => api<Teacher[]>("/teachers"),
  });
  const className = "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm";

  if (!teachers.data) {
    return (
      <>
        {/* Conserva el valor actual en el envío mientras carga la lista. */}
        <input type="hidden" name={name} value={defaultValue ?? ""} />
        <select id={id} disabled className={className} aria-busy="true">
          <option>{teachers.isError ? "No se pudo cargar" : "Cargando…"}</option>
        </select>
      </>
    );
  }

  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue ?? ""}
      disabled={disabled}
      required={required}
      className={className}
    >
      <option value="">{emptyLabel}</option>
      {teachers.data.map((t) => (
        <option key={t.id} value={t.id}>
          {t.firstName} {t.lastName}
        </option>
      ))}
    </select>
  );
}
