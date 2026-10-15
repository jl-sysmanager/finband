import { lazy, type ComponentType } from "react";

const RELOAD_FLAG = "finband:chunk-reload";

// Cada página tiene sus propias props; `lazy` exige este tipo genérico.
// oxlint-disable-next-line typescript/no-explicit-any
type AnyComponent = ComponentType<any>;

/**
 * Página cargada a demanda. Si su fichero ya no existe (la app se actualizó con
 * la pestaña abierta), recarga una vez para obtener la versión nueva en lugar de
 * dejar la pantalla en blanco.
 */
export function lazyPage<K extends string, M extends Record<K, AnyComponent>>(
  load: () => Promise<M>,
  exportName: K,
) {
  return lazy<M[K]>(async () => {
    try {
      const mod = await load();
      sessionStorage.removeItem(RELOAD_FLAG);
      return { default: mod[exportName] };
    } catch (err) {
      let reloaded = true;
      try {
        reloaded = sessionStorage.getItem(RELOAD_FLAG) === "1";
        sessionStorage.setItem(RELOAD_FLAG, "1");
      } catch {
        // Sin almacenamiento disponible: no arriesgamos un bucle de recargas.
      }
      if (!reloaded) {
        window.location.reload();
        return new Promise<never>(() => {});
      }
      throw err;
    }
  });
}
