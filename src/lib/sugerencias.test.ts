import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anotarVenta, juntarDesde, juntarUltimas, noSeVenden, porVencer } from "./sugerencias.ts";
import type { Product } from "./types.ts";

const HOY = "2026-09-25";

function prod(id: string, over: Partial<Product> = {}): Product {
  return {
    id,
    name: id,
    barcode: id,
    price: 1000,
    cost: 600,
    stock: 10,
    stockMin: 0,
    categoryId: "c",
    active: true,
    expiresAt: null,
    priceUpdatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("por vencer", () => {
  it("solo las unidades de los lotes que vencen en el plazo, ordenado por plata en riesgo", () => {
    const yogur = prod("yogur", {
      cost: 500,
      stock: 12,
      lots: [
        { id: "l1", expiresAt: "2026-10-01", units: 10 },
        { id: "l2", expiresAt: "2026-11-20", units: 2 },
      ],
    });
    const leche = prod("leche", { cost: 1200, stock: 6, lots: [{ id: "l3", expiresAt: "2026-09-27", units: 6 }] });
    const lejos = prod("lejos", { lots: [{ id: "l4", expiresAt: "2026-12-01", units: 10 }] });
    const r = porVencer([yogur, leche, lejos], HOY, 15);
    assert.deepEqual(r.map((s) => s.productId), ["leche", "yogur"]);
    assert.equal(r[1]?.motivo, "vence en 6 días, quedan 10");
    assert.equal(r[1]?.plata, 5000);
    assert.equal(r[0]?.plata, 7200);
    assert.equal(r[0]?.plantilla, "liquidacion");
  });

  it("sin costo cargado va al final; los ya vencidos no son 'vence pronto'", () => {
    const sinCosto = prod("sin", { cost: null, lots: [{ id: "l", expiresAt: "2026-09-26", units: 3 }] });
    const conCosto = prod("con", { cost: 10, lots: [{ id: "l", expiresAt: "2026-09-30", units: 1 }] });
    const vencido = prod("vencido", { lots: [{ id: "l", expiresAt: "2026-09-20", units: 5 }] });
    const r = porVencer([sinCosto, conCosto, vencido], HOY, 15);
    assert.deepEqual(r.map((s) => s.productId), ["con", "sin"]);
    assert.equal(r[1]?.plata, null);
    assert.equal(r[1]?.motivo, "vence mañana, quedan 3");
  });
});

describe("no se venden", () => {
  it("sin ventas hace el plazo o más, con stock, ordenado por plata", () => {
    const ultima = { a: "2026-08-20T15:00:00.000Z", b: "2026-09-20T15:00:00.000Z", c: "2026-08-01T15:00:00.000Z" };
    const r = noSeVenden(
      [prod("a", { stock: 8 }), prod("b"), prod("c", { stock: 2, cost: 100 }), prod("sinstock", { stock: 0 })],
      ultima,
      "2026-07-01T00:00:00.000Z",
      HOY,
      30,
    );
    assert.deepEqual(r.map((s) => s.productId), ["a", "c"]);
    assert.equal(r[0]?.motivo, "sin ventas hace 36 días, quedan 8");
    assert.equal(r[0]?.plantilla, "oferta");
  });

  it("sin venta anotada cuenta desde que el local empezó a anotar, no antes", () => {
    const nuevo = noSeVenden([prod("x")], {}, "2026-09-10T12:00:00.000Z", HOY, 30);
    assert.equal(nuevo.length, 0);
    const viejo = noSeVenden([prod("x")], {}, "2026-08-10T12:00:00.000Z", HOY, 30);
    assert.equal(viejo[0]?.motivo, "sin ventas en 46 días, quedan 10");
  });

  it("lo que ya está en 'por vencer' no se repite", () => {
    const r = noSeVenden([prod("x")], {}, "2026-01-01T00:00:00.000Z", HOY, 30, new Set(["x"]));
    assert.equal(r.length, 0);
  });
});

describe("última venta", () => {
  it("cada venta la corre para adelante, nunca para atrás", () => {
    let m = anotarVenta({}, [{ productId: "a" }], "2026-09-20T10:00:00.000Z");
    m = anotarVenta(m, [{ productId: "a" }, { productId: "b" }], "2026-09-10T10:00:00.000Z");
    assert.deepEqual(m, { a: "2026-09-20T10:00:00.000Z", b: "2026-09-10T10:00:00.000Z" });
  });
  it("dos copias: la más nueva de cada producto, y el 'desde' más viejo", () => {
    const j = juntarUltimas({ a: "2026-09-20T10:00:00.000Z" }, { a: "2026-09-21T10:00:00.000Z", b: "2026-09-01T10:00:00.000Z" });
    assert.deepEqual(j, { a: "2026-09-21T10:00:00.000Z", b: "2026-09-01T10:00:00.000Z" });
    assert.equal(juntarDesde("2026-09-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"), "2026-08-01T00:00:00.000Z");
    assert.equal(juntarDesde(undefined, "2026-08-01T00:00:00.000Z"), "2026-08-01T00:00:00.000Z");
  });
});
