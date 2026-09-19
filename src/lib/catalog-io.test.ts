import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { applyCatalogPreview, catalogImportTouched } from "./catalog-io.ts";
import { applyEvent, applyEvents, type ImanEvent } from "./events.ts";
import type { Category, KioskPayload, Product, Settings } from "./types.ts";

const AT = "2026-09-19T12:00:00.000Z";
const settings = { name: "Faro", city: "Rosario", onboarded: true } as Settings;
const beb: Category = { id: "beb", name: "Bebidas", sort: 1 };

function yogur(over: Partial<Product> = {}): Product {
  return {
    id: "yogur",
    name: "Yogur",
    barcode: "7790001",
    price: 1400,
    cost: 900,
    stock: 10,
    stockMin: 2,
    categoryId: "beb",
    active: true,
    expiresAt: "2026-09-20",
    lots: [
      { id: "lt_a", expiresAt: "2026-09-20", units: 3, createdAt: "2026-09-17T12:00:00.000Z" },
      { id: "lt_b", expiresAt: "2026-09-25", units: 5, createdAt: "2026-09-17T12:00:00.000Z" },
    ],
    priceUpdatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

function payload(products: Product[], categories: Category[] = [beb]): KioskPayload {
  return {
    products,
    categories,
    sales: [],
    settings,
    suppliers: [],
    shifts: [],
    drops: [],
    orders: [],
    movements: [],
    ticket: [],
    payMethod: "efectivo",
  };
}

function productEv(p: Product, id = "ev_prod"): ImanEvent {
  return { id, at: AT, deviceId: "pc", storeId: "s1", type: "product", body: p as unknown as ImanEvent["body"] };
}

function categoryEv(cat: Category, id = "ev_cat"): ImanEvent {
  return {
    id,
    at: AT,
    deviceId: "pc",
    storeId: "s1",
    type: "category",
    body: { op: "save", cat } as unknown as ImanEvent["body"],
  };
}

describe("importar catálogo", () => {
  it("producto existente: ignora el stock de la planilla y no toca los lotes; viaja precio y nombre", () => {
    const antes = yogur();
    const after = applyCatalogPreview(
      [{ name: "Yogur firme", barcode: "7790001", price: 1800, cost: 950, stock: 99, category: "Bebidas" }],
      [antes],
      [beb],
    );
    const got = after.products[0];
    assert.equal(got?.stock, 10);
    assert.deepEqual(got?.lots, antes.lots);
    assert.equal(got?.expiresAt, "2026-09-20");
    assert.equal(got?.name, "Yogur firme");
    assert.equal(got?.price, 1800);
    assert.equal(got?.cost, 950);

    const { upserts, newCategories } = catalogImportTouched(
      { products: [antes], categories: [beb] },
      after,
    );
    assert.equal(newCategories.length, 0);
    assert.equal(upserts.length, 1);

    const celu = applyEvent(payload([antes]), productEv(upserts[0]!));
    assert.equal(celu.products[0]?.name, "Yogur firme");
    assert.equal(celu.products[0]?.price, 1800);
    assert.equal(celu.products[0]?.stock, 10);
    assert.deepEqual(celu.products[0]?.lots, antes.lots);
  });

  it("fila nueva: el otro aparato la recibe con el stock de la planilla", () => {
    const after = applyCatalogPreview(
      [{ name: "Sprite", barcode: "7790002", price: 1500, cost: 700, stock: 24, category: "Gaseosas" }],
      [],
      [beb],
    );
    const alta = after.products.find((p) => p.barcode === "7790002");
    assert.equal(alta?.stock, 24);
    assert.equal(alta?.lots, undefined);
    assert.equal(alta?.expiresAt, null);

    const { upserts, newCategories } = catalogImportTouched(
      { products: [], categories: [beb] },
      after,
    );
    assert.equal(newCategories.length, 1);
    assert.equal(newCategories[0]?.name, "Gaseosas");
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.stock, 24);

    const celu = applyEvents(payload([], [beb]), [categoryEv(newCategories[0]!), productEv(upserts[0]!)]);
    assert.equal(celu.categories.some((c) => c.name === "Gaseosas"), true);
    const rec = celu.products.find((p) => p.barcode === "7790002");
    assert.equal(rec?.name, "Sprite");
    assert.equal(rec?.stock, 24);
    assert.equal(rec?.lots, undefined);
  });
});
