import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mergeAggs, prunePayload } from "./cap.ts";
import type { KioskPayload, MonthAgg, Product, Sale, SaleItem, Settings } from "./types.ts";

const settings = { name: "Kiosco de Prueba", city: "Rosario", onboarded: true } as Settings;

/** Una venta vieja: el plegado se lleva todo lo que pasó de una semana. */
function haceDias(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function producto(partial: Partial<Product> & Pick<Product, "id">): Product {
  return {
    name: "Coca-Cola 2.25 L",
    barcode: "1",
    price: 1000,
    cost: 400,
    stock: 10,
    stockMin: 2,
    packQty: 1,
    packBarcode: "",
    categoryId: "beb",
    active: true,
    expiresAt: null,
    priceUpdatedAt: haceDias(1),
    ...partial,
  };
}

function venta(items: SaleItem[], over: Partial<Sale> = {}): Sale {
  return {
    id: "sa1",
    createdAt: haceDias(30),
    paymentMethod: "efectivo",
    note: "",
    total: items.reduce((a, it) => a + it.price * it.qty, 0),
    paid: null,
    items,
    ...over,
  };
}

function payload(partial: Partial<KioskPayload>): KioskPayload {
  return {
    products: [],
    categories: [],
    sales: [],
    settings,
    suppliers: [],
    shifts: [],
    drops: [],
    orders: [],
    movements: [],
    ticket: [],
    payMethod: "efectivo",
    ...partial,
  };
}

const agg = (p: KioskPayload): MonthAgg | undefined => prunePayload(p).monthAggs?.[0];

test("el costo que guardó la venta es el que manda", () => {
  const p = payload({
    products: [producto({ id: "p1", cost: 900 })],
    sales: [venta([{ productId: "p1", name: "Coca", price: 1000, qty: 2, cost: 400 }])],
  });
  // 2 × 400, el del día de la venta. Ni el costo de hoy ni un porcentaje.
  assert.equal(agg(p)?.cogs, 800);
  assert.equal(agg(p)?.cogsMissing, 0);
  assert.equal(agg(p)?.cogsTrusted, true);
});

test("una venta vieja sin costo cae al costo de hoy del producto", () => {
  const p = payload({
    products: [producto({ id: "p1", cost: 400 })],
    sales: [venta([{ productId: "p1", name: "Coca", price: 1000, qty: 3 }])],
  });
  assert.equal(agg(p)?.cogs, 1200);
  assert.equal(agg(p)?.cogsMissing, 0);
});

test("sin costo por ningún lado no se inventa: la unidad queda contada aparte", () => {
  const p = payload({
    products: [producto({ id: "p1", cost: null })],
    sales: [venta([{ productId: "p1", name: "Coca", price: 1000, qty: 2 }])],
  });
  const a = agg(p);
  assert.equal(a?.cogs, 0);
  assert.equal(a?.cogsMissing, 2);
  // El método viejo habría puesto 1400: el 70% de lo vendido.
  assert.notEqual(a?.cogs, 1400);
});

test("un producto que ya no está en el catálogo no rompe el plegado", () => {
  const p = payload({
    products: [],
    sales: [venta([{ productId: "fantasma", name: "Lo que sea", price: 500, qty: 1 }])],
  });
  assert.equal(agg(p)?.cogs, 0);
  assert.equal(agg(p)?.cogsMissing, 1);
});

test("una venta reciente no se pliega", () => {
  const p = payload({
    products: [producto({ id: "p1" })],
    sales: [venta([{ productId: "p1", name: "Coca", price: 1000, qty: 1, cost: 400 }], { createdAt: haceDias(1) })],
  });
  const pruned = prunePayload(p);
  assert.equal(pruned.monthAggs?.length, 0);
  assert.equal(pruned.sales.length, 1);
});

test("juntar un mes viejo con uno nuevo deja el mes marcado como no confiable", () => {
  const viejo: MonthAgg = { ym: "2026-01", ventas: 1000, tickets: 1, mp: 0, efectivo: 1000, debito: 0, cogs: 700 };
  const nuevo: MonthAgg = {
    ym: "2026-01",
    ventas: 500,
    tickets: 1,
    mp: 0,
    efectivo: 500,
    debito: 0,
    cogs: 200,
    cogsMissing: 3,
    cogsTrusted: true,
  };
  const [row] = mergeAggs([viejo], [nuevo]);
  assert.equal(row?.ventas, 1500);
  assert.equal(row?.cogs, 900);
  assert.equal(row?.cogsMissing, 3);
  assert.equal(row?.cogsTrusted, false);
});

test("dos plegados nuevos del mismo mes siguen siendo confiables", () => {
  const uno: MonthAgg = { ym: "2026-02", ventas: 100, tickets: 1, mp: 0, efectivo: 100, debito: 0, cogs: 40, cogsMissing: 0, cogsTrusted: true };
  const dos: MonthAgg = { ym: "2026-02", ventas: 200, tickets: 1, mp: 200, efectivo: 0, debito: 0, cogs: 80, cogsMissing: 1, cogsTrusted: true };
  const [row] = mergeAggs([uno], [dos]);
  assert.equal(row?.cogsTrusted, true);
  assert.equal(row?.cogsMissing, 1);
  assert.equal(row?.mp, 200);
});
