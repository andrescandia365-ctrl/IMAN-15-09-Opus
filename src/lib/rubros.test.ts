import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { bloqueoPorRubros } from "./rubros.ts";
import type { Supplier } from "./types.ts";

function prov(id: string, name: string, categoryIds?: string[]): Supplier {
  return { id, name, days: [1], notes: "", whatsapp: "", invoiceType: "A", ...(categoryIds ? { categoryIds } : {}) };
}

describe("borrar una categoría no deja proveedores sin rubros", () => {
  it("si es el único rubro de un proveedor, no se puede, y dice cuál y qué hacer", () => {
    const provs = [prov("s4", "La Serenísima", ["lac"]), prov("s5", "Mayorista", ["alm", "lac"])];
    assert.equal(
      bloqueoPorRubros(provs, "lac"),
      "La Serenísima quedaría sin rubros. Asignale otro antes de borrar este.",
    );
  });

  it("si son varios, los nombra a todos", () => {
    const provs = [
      prov("s4", "La Serenísima", ["lac"]),
      prov("s6", "Lácteos Juan", ["lac"]),
      prov("s7", "Tregar", ["lac"]),
    ];
    assert.equal(
      bloqueoPorRubros(provs, "lac"),
      "La Serenísima, Lácteos Juan y Tregar quedarían sin rubros. Asignales otro antes de borrar este.",
    );
  });

  it("si nadie la tiene como único rubro, se puede borrar como siempre", () => {
    const provs = [
      prov("s5", "Mayorista", ["alm", "fia", "kio"]),
      // Creado sin rubros a propósito: no lo toca.
      prov("s8", "Trae de todo"),
      prov("s9", "Sin rubros cargados", []),
    ];
    assert.equal(bloqueoPorRubros(provs, "fia"), null);
    assert.equal(bloqueoPorRubros(provs, "nadie-la-tiene"), null);
  });
});
