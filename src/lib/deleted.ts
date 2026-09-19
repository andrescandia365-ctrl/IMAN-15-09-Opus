/**
 * Los productos borrados que este local recuerda. Un evento de producto que
 * llega tarde (un cambio de precio del celu, un editor que se abrió antes del
 * borrado) no puede revivirlos. Un producto que el aparato nunca vio y que no
 * está en la lista sí entra con su evento: así un aparato que arrancó sin él
 * lo recupera con el próximo cambio. La lista solo frena que vuelva a
 * aparecer: si el producto está (se recargó el catálogo de ejemplo), manda el
 * producto.
 *
 * Cada borrado guarda nombre, cuándo y qué aparato: si un día "desaparecen
 * productos", queda el rastro de si fue un borrado real. Viaja en la
 * fotocopia y se guardan los últimos DELETED_KEEP.
 */
import type { DeletedProduct } from "./types";

export type { DeletedProduct };

export const DELETED_KEEP = 500;

/** Lo que ve quien guarda un producto que otro aparato borró mientras lo editaba. */
export const BORRADO_MIENTRAS_EDITABAS =
  "Este producto se borró desde otro aparato mientras lo editabas. Si lo querés de vuelta, dalo de alta de nuevo.";

export function isDeleted(list: DeletedProduct[] | undefined, id: string): boolean {
  return Boolean(list?.some((d) => d.id === id));
}

/** Suma borrados sin repetir: de un mismo producto queda el primero que se registró. */
export function mergeDeleted(a: DeletedProduct[] | undefined, b: DeletedProduct[] | undefined): DeletedProduct[] {
  const map = new Map<string, DeletedProduct>();
  for (const d of [...(a ?? []), ...(b ?? [])]) {
    if (!d?.id) continue;
    const cur = map.get(d.id);
    if (!cur || d.at < cur.at) map.set(d.id, d);
  }
  return [...map.values()].sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, DELETED_KEEP);
}

/** Sacar de la lista: recargar el catálogo de ejemplo vuelve a usar los mismos ids. */
export function forgetDeleted(list: DeletedProduct[] | undefined, ids: Iterable<string>): DeletedProduct[] {
  const fuera = new Set(ids);
  return (list ?? []).filter((d) => !fuera.has(d.id));
}

/** "Coca, Sprite, Fanta y 4 más", para la línea del registro de sincronización. */
export function nombresBorrados(names: string[], max = 3): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} y ${names.length - max} más`;
}

/**
 * Los productos de este aparato que saca un lote de eventos de otro. Uno que
 * acá no estaba no cuenta: no desapareció nada.
 */
export function quitadosPor(
  products: { id: string; name: string }[],
  events: { type: string; body: unknown }[],
): string[] {
  const byId = new Map(products.map((p) => [p.id, p.name]));
  const names: string[] = [];
  for (const ev of events) {
    if (ev.type !== "product.delete") continue;
    const id = (ev.body as { id?: string } | null)?.id;
    const name = id ? byId.get(id) : undefined;
    if (name == null) continue;
    names.push(name);
    byId.delete(id!);
  }
  return names;
}
