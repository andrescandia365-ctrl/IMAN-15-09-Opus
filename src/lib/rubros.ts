/**
 * Un proveedor "sin rubros" cuenta como que trae todo para la factura
 * (invoiceForProduct): le cambia la Fac de góndola a productos de otros rubros.
 * Crearlo así a propósito sigue valiendo; lo que se frena es llegar ahí por
 * borrar la última categoría que tenía.
 */
import type { Supplier } from "./types";

/** Los proveedores para los que esta categoría es el único rubro. */
export function quedanSinRubros(suppliers: Supplier[], categoryId: string): Supplier[] {
  return suppliers.filter((s) => {
    const ids = s.categoryIds ?? [];
    return ids.length > 0 && ids.every((x) => x === categoryId);
  });
}

function enLista(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Por qué no se puede borrar la categoría, o `null` si se puede. */
export function bloqueoPorRubros(suppliers: Supplier[], categoryId: string): string | null {
  const quedan = quedanSinRubros(suppliers, categoryId);
  if (!quedan.length) return null;
  const nombres = enLista(quedan.map((s) => s.name));
  return quedan.length === 1
    ? `${nombres} quedaría sin rubros. Asignale otro antes de borrar este.`
    : `${nombres} quedarían sin rubros. Asignales otro antes de borrar este.`;
}
