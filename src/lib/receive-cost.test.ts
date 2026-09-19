import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { applyEvents, type ImanEvent } from "./events.ts";
import { costoAGondola, planReceive } from "./receive-cost.ts";
import type { Category, KioskPayload, Product, Settings, Supplier } from "./types.ts";

const AT = "2026-09-19T12:00:00.000Z";
const settings = {
  name: "Faro",
  city: "Rosario",
  onboarded: true,
  roundStep: 100,
  roundMode: "up",
  priceMarkups: { beb: 1.5 },
  priceMarkupsA: { beb: 1.8 },
} as unknown as Settings;
const beb: Category = { id: "beb", name: "Bebidas", sort: 1 };
const omar: Supplier = {
  id: "omar",
  name: "Omar",
  days: [1],
  notes: "",
  whatsapp: "",
  categoryIds: ["beb"],
  invoiceType: "A",
};

function prod(id: string, over: Partial<Product> = {}): Product {
  return {
    id,
    name: id,
    barcode: `779${id}`,
    price: 1800,
    cost: 1000,
    stock: 10,
    stockMin: 2,
    categoryId: "beb",
    active: true,
    expiresAt: "2026-09-25",
    lots: [
      { id: `lt_${id}a`, expiresAt: "2026-09-20", units: 4 },
      { id: `lt_${id}b`, expiresAt: "2026-09-25", units: 6 },
    ],
    priceUpdatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

function payload(products: Product[]): KioskPayload {
  return {
    products,
    categories: [beb],
    sales: [],
    settings,
    suppliers: [omar],
    shifts: [],
    drops: [],
    orders: [
      {
        id: "or1",
        supplierId: "omar",
        supplierName: "Omar",
        lines: [
          { productId: "coca", name: "Coca", qty: 6, asUnit: true },
          { productId: "sprite", name: "Sprite", qty: 6, asUnit: true },
          { productId: "fanta", name: "Fanta", qty: 6, asUnit: true },
        ],
        text: "",
        createdAt: AT,
        sent: true,
        received: false,
      },
    ],
    movements: [],
    ticket: [],
    payMethod: "efectivo",
  };
}

describe("recepción contra la boleta", () => {
  it("2 de 3 renglones + costo en uno: el que no llegó no suma stock y los lotes quedan", () => {
    const products = [prod("coca"), prod("sprite"), prod("fanta")];
    const order = payload(products).orders[0]!;
    const plan = planReceive(order.lines, products, [
      { productId: "coca", units: 6, asUnit: true, cost: 1200 },
      { productId: "sprite", units: 6, asUnit: true },
      { productId: "fanta", units: 0, asUnit: true },
    ]);
    assert.equal(plan.qtyByProduct.get("coca"), 6);
    assert.equal(plan.qtyByProduct.get("sprite"), 6);
    assert.equal(plan.qtyByProduct.has("fanta"), false);
    assert.equal(plan.short, true);
    assert.deepEqual(
      plan.costs.map((c) => [c.productId, c.cost]),
      [["coca", 1200]],
    );

    const patch = costoAGondola(products[0]!, 1200, [beb], [omar], settings);
    assert.equal(patch.cost, 1200);
    assert.ok(patch.price != null && patch.price > 1200);

    const receive: ImanEvent = {
      id: "ev_rec",
      at: AT,
      deviceId: "pc",
      storeId: "s1",
      type: "receive",
      body: {
        orderId: "or1",
        lines: [...plan.qtyByProduct.entries()].map(([productId, units]) => ({ productId, units })),
        receiptStatus: "short",
        orderLines: plan.nextLines,
      } as unknown as ImanEvent["body"],
    };
    const productEv: ImanEvent = {
      id: "ev_cost",
      at: AT,
      deviceId: "pc",
      storeId: "s1",
      type: "product",
      body: { ...products[0]!, cost: patch.cost, price: patch.price!, stock: 16 } as unknown as ImanEvent["body"],
    };

    for (const eventos of [
      [receive, productEv],
      [productEv, receive],
    ]) {
      const next = applyEvents(payload(products), eventos);
      const coca = next.products.find((p) => p.id === "coca")!;
      const sprite = next.products.find((p) => p.id === "sprite")!;
      const fanta = next.products.find((p) => p.id === "fanta")!;
      assert.equal(coca.stock, 16);
      assert.equal(sprite.stock, 16);
      assert.equal(fanta.stock, 10);
      assert.deepEqual(fanta.lots, products[2]!.lots);
      assert.deepEqual(coca.lots, products[0]!.lots);
      assert.equal(coca.cost, 1200);
      assert.equal(coca.price, patch.price);
    }
  });
});
