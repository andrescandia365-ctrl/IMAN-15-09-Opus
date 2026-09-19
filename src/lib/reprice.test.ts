import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { appendEvent, chunk, emptyQueue, pendingOf, PUSH_BATCH } from "./event-queue.ts";
import { applyEvents, catalogSaveEvent, type ImanEvent } from "./events.ts";
import { quotedPrice, repriceProducts } from "./pricing.ts";
import type { KioskPayload, Product, Settings } from "./types.ts";

const AT = "2026-09-18T12:00:00.000Z";

function product(id: string, categoryId: string, cost: number, price: number): Product {
  return {
    id,
    name: id,
    barcode: `779${id}`,
    price,
    cost,
    stock: 10,
    stockMin: 2,
    categoryId,
    active: true,
    expiresAt: null,
    priceUpdatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** El mismo evento que arma applyCategoryPrices / setProductPrices. */
function saveEvent(prev: Product | undefined, p: Product, i: number): ImanEvent {
  const ev = catalogSaveEvent(prev, p);
  assert.ok(ev);
  return {
    id: `ev-${i}`,
    at: AT,
    deviceId: "pc",
    storeId: "s1",
    type: ev!.type,
    body: ev!.body,
  };
}

/** Lo que hace applyCategoryPrices: precio del rubro con factor 1,5 y redondeo 100 arriba. */
function porRubro(categoryId: string) {
  return (p: Product) => (p.categoryId === categoryId ? quotedPrice(p, 1.5, 100, "up") : null);
}

function payload(products: Product[]): KioskPayload {
  return {
    products,
    categories: [],
    sales: [],
    settings: { name: "Kiosco", city: "Rosario" } as Settings,
    suppliers: [],
    shifts: [],
    drops: [],
    orders: [],
    movements: [],
    ticket: [],
    payMethod: "efectivo",
  };
}

describe("precios del dueño a la cinta de sync", () => {
  it("un evento por producto que cambió, con el producto ya actualizado", () => {
    const antes = [
      product("coca", "beb", 1000, 1200), // 1000 × 1,5 = 1500: cambia
      product("sprite", "beb", 1000, 1500), // ya está en 1500: no cambia
      product("agua", "beb", 800, 900), // 800 × 1,5 = 1200: cambia
      product("alfajor", "gol", 400, 500), // otro rubro: no se toca
    ];
    const r = repriceProducts(antes, porRubro("beb"), AT);

    assert.deepEqual(
      r.changed.map((p) => [p.id, p.price, p.priceUpdatedAt]),
      [
        ["coca", 1500, AT],
        ["agua", 1200, AT],
      ],
    );
    assert.equal(r.products.find((p) => p.id === "sprite"), antes[1]);
    assert.equal(r.products.find((p) => p.id === "alfajor"), antes[3]);

    const coca = catalogSaveEvent(antes[0], r.changed[0]!);
    assert.equal(coca?.type, "price");
    assert.equal("stock" in (coca?.body ?? {}), false);
    assert.equal("lots" in (coca?.body ?? {}), false);
    assert.equal("name" in (coca?.body ?? {}), false);
    for (const p of r.changed) {
      assert.equal(catalogSaveEvent(antes.find((x) => x.id === p.id), p)?.type, "price");
    }

    // Otro aparato que baja esos eventos queda con los precios nuevos.
    const otro = applyEvents(
      payload(antes),
      r.changed.map((p, i) => saveEvent(antes.find((x) => x.id === p.id), p, i)),
    );
    assert.deepEqual(
      otro.products.map((p) => [p.id, p.price]),
      [
        ["coca", 1500],
        ["sprite", 1500],
        ["agua", 1200],
        ["alfajor", 500],
      ],
    );
  });

  it("un rubro donde ningún precio cambia no deja ningún evento", () => {
    const antes = [product("coca", "beb", 1000, 1500), product("sprite", "beb", 1200, 1800)];
    const r = repriceProducts(antes, porRubro("beb"), AT);
    assert.equal(r.changed.length, 0);
    assert.deepEqual(r.products, antes);

    // setProductPrices con los mismos precios tampoco.
    const iguales = new Map([
      ["coca", 1500],
      ["sprite", 1800],
    ]);
    assert.equal(repriceProducts(antes, (p) => iguales.get(p.id) ?? null, AT).changed.length, 0);
  });

  it("un rubro de 200 productos entra entero a la cola y sube en tandas", () => {
    const antes = Array.from({ length: 200 }, (_, i) => product(`p${i}`, "alm", 1000 + i, 1));
    const r = repriceProducts(antes, porRubro("alm"), AT);
    assert.equal(r.changed.length, 200);

    let q = emptyQueue();
    r.changed.forEach((p, i) => {
      q = appendEvent(q, saveEvent(antes.find((x) => x.id === p.id), p, i));
    });
    const pendientes = pendingOf(q);
    assert.equal(pendientes.length, 200);
    assert.deepEqual(
      chunk(pendientes).map((t) => t.length),
      [PUSH_BATCH],
    );

    // Uno más (una venta del mismo rato) pasa a una segunda tanda, sin perder nada.
    q = appendEvent(q, { ...saveEvent(antes[0], { ...antes[0]!, price: 2 }, 999), type: "sale" });
    assert.deepEqual(
      chunk(pendingOf(q)).map((t) => t.length),
      [200, 1],
    );
  });
});
