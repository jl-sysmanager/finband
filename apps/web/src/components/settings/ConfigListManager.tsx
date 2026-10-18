import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/hooks/useConfirm";
import { ApiError, api } from "@/lib/api";
import { toast } from "@/stores/toast";

/** Elemento de una lista configurable, ya normalizado. */
export type ConfigListItem = {
  id: string;
  name: string;
  /** Uso informativo ("12 apuntes"). */
  usage: string;
  /** Solo en listas que se activan/desactivan (métodos de pago). */
  active?: boolean;
  /** Etiqueta destacada (p. ej. "Gestionada por la app"). */
  badge?: string;
  /** Motivo por el que no se puede borrar; vacío = se puede. */
  deleteBlockedReason?: string;
};

type Props<Row> = {
  title: string;
  description: string;
  /** Ruta de la API (p. ej. "/settings/income-categories"). */
  endpoint: string;
  /** Clave de caché compartida con los formularios que usan la lista. */
  queryKey: string;
  /** Campo del nombre en la API ("name" o "label"). */
  nameField: "name" | "label";
  toItem: (row: Row) => ConfigListItem;
  canEdit: boolean;
  /** Muestra el interruptor activo/inactivo. */
  supportsActive?: boolean;
  addPlaceholder: string;
};

export function ConfigListManager<Row>({
  title,
  description,
  endpoint,
  queryKey,
  nameField,
  toItem,
  canEdit,
  supportsActive,
  addPlaceholder,
}: Props<Row>) {
  const qc = useQueryClient();
  const uid = useId();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const list = useQuery({ queryKey: [queryKey], queryFn: () => api<Row[]>(endpoint) });
  const items = (list.data ?? []).map(toItem);

  const onError = (err: unknown) =>
    toast(err instanceof ApiError ? err.message : "No se pudo guardar el cambio", "error");
  const refresh = () => qc.invalidateQueries({ queryKey: [queryKey] });

  const create = useMutation({
    mutationFn: (name: string) =>
      api(endpoint, { method: "POST", body: JSON.stringify({ [nameField]: name }) }),
    onSuccess: () => {
      setNewName("");
      void refresh();
    },
    onError,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`${endpoint}/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      void refresh();
    },
    onError,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api(`${endpoint}/order`, { method: "PUT", body: JSON.stringify({ ids }) }),
    onSettled: () => void refresh(),
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${endpoint}/${id}`, { method: "DELETE" }),
    onSuccess: () => void refresh(),
    onError,
  });

  function move(index: number, delta: number) {
    const ids = items.map((i) => i.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  }

  async function confirmRemove(item: ConfigListItem) {
    const ok = await confirm({
      title: "Eliminar",
      description: `¿Eliminar «${item.name}»?`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) remove.mutate(item.id);
  }

  function saveEdit() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    update.mutate({ id: editing.id, body: { [nameField]: name } });
  }

  return (
    <Card>
      {confirmDialog}
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">La lista está vacía.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((item, index) => {
              const isEditing = editing?.id === item.id;
              const inactive = supportsActive && item.active === false;
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  {isEditing ? (
                    <form
                      className="flex min-w-[200px] flex-1 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveEdit();
                      }}
                    >
                      <label htmlFor={`${uid}-edit`} className="sr-only">
                        Nuevo nombre
                      </label>
                      <Input
                        id={`${uid}-edit`}
                        autoFocus
                        value={editing.name}
                        onChange={(e) => setEditing({ id: item.id, name: e.target.value })}
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                        className="h-8"
                      />
                      <Button type="submit" size="icon" variant="ghost" aria-label="Guardar nombre">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Cancelar"
                        onClick={() => setEditing(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : (
                    <div className="min-w-[160px] flex-1">
                      <span className={inactive ? "text-muted-foreground line-through" : "font-medium"}>
                        {item.name}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">{item.usage}</span>
                      {item.badge ? (
                        <Badge variant="secondary" className="ml-2">
                          {item.badge}
                        </Badge>
                      ) : null}
                      {inactive ? (
                        <Badge variant="secondary" className="ml-2">
                          Desactivado
                        </Badge>
                      ) : null}
                    </div>
                  )}
                  {canEdit && !isEditing ? (
                    <div className="flex items-center gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Subir ${item.name}`}
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Bajar ${item.name}`}
                        disabled={index === items.length - 1 || reorder.isPending}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Renombrar ${item.name}`}
                        onClick={() => setEditing({ id: item.id, name: item.name })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {supportsActive ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={update.isPending}
                          onClick={() => update.mutate({ id: item.id, body: { active: !item.active } })}
                        >
                          {item.active ? "Desactivar" : "Activar"}
                        </Button>
                      ) : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Eliminar ${item.name}`}
                        title={item.deleteBlockedReason || "Eliminar"}
                        disabled={!!item.deleteBlockedReason || remove.isPending}
                        onClick={() => void confirmRemove(item)}
                      >
                        <Trash2 className="h-4 w-4 text-expense" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {canEdit ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) create.mutate(newName.trim());
            }}
          >
            <label htmlFor={`${uid}-new`} className="sr-only">
              {addPlaceholder}
            </label>
            <Input
              id={`${uid}-new`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={addPlaceholder}
              maxLength={60}
            />
            <Button type="submit" size="sm" disabled={!newName.trim() || create.isPending}>
              <Plus className="h-4 w-4" /> Añadir
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
