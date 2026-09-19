import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DELETED_KEEP, forgetDeleted, isDeleted, mergeDeleted, nombresBorrados, quitadosPor } from "./deleted.ts";

describe("lista de productos borrados", () => {
  it("suma los dos lados sin repetir, y del mismo producto queda el primer borrado", () => {
    const r = mergeDeleted(
      [{ id: "coca", at: "2026-09-18T10:00:00.000Z", name: "Coca" }],
      [
        { id: "coca", at: "2026-09-18T12:00:00.000Z", name: "Coca" },
        { id: "sprite", at: "2026-09-18T11:00:00.000Z", name: "Sprite" },
      ],
    );
    assert.deepEqual(
      r.map((d) => `${d.id}@${d.at.slice(11, 13)}`),
      ["sprite@11", "coca@10"],
    );
  });

  it("se guardan los últimos 500", () => {
    const muchos = Array.from({ length: DELETED_KEEP + 20 }, (_, i) => ({
      id: `p${i}`,
      at: new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString(),
    }));
    const r = mergeDeleted(muchos, []);
    assert.equal(r.length, DELETED_KEEP);
    assert.equal(r[0]?.id, `p${DELETED_KEEP + 19}`);
  });

  it("recargar el catálogo de ejemplo saca sus ids de la lista", () => {
    const lista = [
      { id: "p1", at: "2026-09-18T10:00:00.000Z" },
      { id: "propio", at: "2026-09-18T10:00:00.000Z" },
    ];
    const r = forgetDeleted(lista, ["p1", "p2"]);
    assert.deepEqual(r.map((d) => d.id), ["propio"]);
    assert.equal(isDeleted(r, "p1"), false);
    assert.equal(isDeleted(r, "propio"), true);
  });
});

describe("la línea del registro de sincronización", () => {
  it("nombra los productos que este aparato tenía y ya no", () => {
    const productos = [
      { id: "coca", name: "Coca" },
      { id: "sprite", name: "Sprite" },
    ];
    const eventos = [
      { type: "product.delete", body: { id: "coca" } },
      { type: "product", body: { id: "sprite" } },
      // Uno que acá no estaba no desapareció de ningún lado.
      { type: "product.delete", body: { id: "fanta" } },
      { type: "product.delete", body: { id: "coca" } },
    ];
    assert.deepEqual(quitadosPor(productos, eventos), ["Coca"]);
  });

  it("muchos se resumen", () => {
    assert.equal(nombresBorrados(["Coca", "Sprite"]), "Coca, Sprite");
    assert.equal(nombresBorrados(["Coca", "Sprite", "Fanta", "Agua", "Soda"]), "Coca, Sprite, Fanta y 2 más");
  });
});
