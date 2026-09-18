import { strict as assert } from "node:assert";
import { test } from "node:test";
import { applyEvent, applyEvents, pulledPatch, type ImanEvent } from "./events.ts";
import { consumeFifo } from "./lots.ts";
import type { Category, KioskPayload, Product, Sale, Settings, Supplier } from "./types.ts";

const settings = { name: "Kiosco de Prueba", city: "Rosario", onboarded: true } as Settings;

function supplier(partial: Partial<Supplier> = {}): Supplier {
  return {
    id: "prov-omar",
    name: "Omar",
    days: [1, 4],
    categoryIds: ["c-bebidas", "c-almacen"],
    notes: "",
    whatsapp: "",
    ...partial,
  };
}

function payload(partial: Partial<KioskPayload> = {}): KioskPayload {
  return {
    products: [],
    categories: [
      { id: "c-bebidas", name: "Bebidas", sort: 1 },
      { id: "c-almacen", name: "Almacén", sort: 2 },
    ],
    sales: [],
    settings,
    suppliers: [supplier()],
    shifts: [],
    drops: [],
    orders: [],
    movements: [],
    ticket: [],
    payMethod: "efectivo",
    ...partial,
  };
}

function ev(body: unknown, over: Partial<ImanEvent> = {}): ImanEvent {
  return {
    id: "ev_cat",
    at: "2026-09-17T12:00:00.000Z",
    deviceId: "dev_pc",
    storeId: "s1",
    type: "category",
    body: body as ImanEvent["body"],
    ...over,
  };
}

test("una categoría nueva de la PC aparece en el otro aparato", () => {
  const cat: Category = { id: "c-limpieza", name: "Limpieza", sort: 3 };
  const next = applyEvent(payload(), ev({ op: "save", cat }));
  assert.deepEqual(
    next.categories.map((c) => c.name),
    ["Bebidas", "Almacén", "Limpieza"],
  );
  assert.equal(next.categories.at(-1)?.sort, 3);
});

test("el renombre pisa la categoría que ya estaba, sin duplicarla", () => {
  const cat: Category = { id: "c-almacen", name: "Almacén y limpieza", sort: 2 };
  const next = applyEvent(payload(), ev({ op: "save", cat }));
  assert.equal(next.categories.length, 2);
  assert.equal(next.categories.find((c) => c.id === "c-almacen")?.name, "Almacén y limpieza");
});

test("al borrarla también se va de los proveedores que la tenían", () => {
  const next = applyEvent(payload(), ev({ op: "delete", id: "c-almacen" }));
  assert.deepEqual(
    next.categories.map((c) => c.id),
    ["c-bebidas"],
  );
  assert.deepEqual(next.suppliers[0]?.categoryIds, ["c-bebidas"]);
});

test("un proveedor sin categorías asignadas no se rompe al borrar", () => {
  const sin = payload({ suppliers: [supplier({ categoryIds: undefined })] });
  const next = applyEvent(sin, ev({ op: "delete", id: "c-almacen" }));
  assert.deepEqual(next.suppliers[0]?.categoryIds, []);
});

test("un sobre incompleto no toca nada", () => {
  const antes = payload();
  for (const body of [
    { op: "save" },
    { op: "save", cat: { name: "Sin id" } },
    { op: "delete" },
    { op: "mover", id: "c-almacen" },
    {},
  ]) {
    const next = applyEvent(antes, ev(body));
    assert.equal(next, antes);
  }
});

// syncNow aplica los eventos ajenos y escribe al store lo que devuelve pulledPatch.
test("syncNow guarda el renombre de categoría que bajó de otro aparato", () => {
  const renombre = ev({ op: "save", cat: { id: "c-bebidas", name: "Bebidas frías", sort: 1 } });
  const alStore = pulledPatch(applyEvents(payload(), [renombre]));
  assert.deepEqual(
    alStore.categories.map((c) => c.name),
    ["Bebidas frías", "Almacén"],
  );
});

test("syncNow guarda el borrado de categoría que bajó de otro aparato", () => {
  const vacia: Category = { id: "c-vacia", name: "Vacía", sort: 3 };
  const antes = payload({
    categories: [...payload().categories, vacia],
  });
  const alStore = pulledPatch(applyEvents(antes, [ev({ op: "delete", id: "c-vacia" })]));
  assert.deepEqual(
    alStore.categories.map((c) => c.id),
    ["c-bebidas", "c-almacen"],
  );
});

// Lotes: el aparato que recibe la venta tiene que quedar con los mismos lotes que la caja.
function conLotes(): Product {
  return {
    id: "yogur",
    name: "Yogur",
    barcode: "7790001",
    price: 1400,
    cost: 900,
    stock: 10,
    stockMin: 2,
    categoryId: "c-almacen",
    active: true,
    expiresAt: "2026-09-20",
    lots: [
      { id: "lt_b", expiresAt: "2026-09-25", units: 5 },
      { id: "lt_a", expiresAt: "2026-09-20", units: 3 },
    ],
    priceUpdatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function venta(id: string, qty: number, productId = "yogur"): ImanEvent {
  const sale: Sale = {
    id,
    createdAt: "2026-09-18T12:00:00.000Z",
    paymentMethod: "efectivo",
    note: "",
    total: 1400 * qty,
    paid: null,
    items: [{ productId, name: "Yogur", price: 1400, qty }],
  };
  return ev(sale, { id: `ev_${id}`, type: "sale" });
}

test("una venta con lotes deja en el otro aparato los mismos lotes que en la caja", () => {
  const enLaCaja = consumeFifo(conLotes(), 4);
  const enElCelu = applyEvent(payload({ products: [conLotes()] }), venta("v1", 4)).products[0];
  assert.deepEqual(enElCelu, enLaCaja);
  // Se comió el lote del 20 entero y 1 del 25.
  assert.deepEqual(enElCelu?.lots, [{ id: "lt_b", expiresAt: "2026-09-25", units: 4 }]);
  assert.equal(enElCelu?.stock, 6);
  assert.equal(enElCelu?.expiresAt, "2026-09-25");
});

test("dos ventas llegan en cualquier orden y los lotes quedan iguales", () => {
  const antes = payload({ products: [conLotes()] });
  const unOrden = applyEvents(antes, [venta("v1", 2), venta("v2", 3)]).products[0];
  const otroOrden = applyEvents(antes, [venta("v2", 3), venta("v1", 2)]).products[0];
  assert.deepEqual(unOrden, otroOrden);
  assert.deepEqual(unOrden, consumeFifo(conLotes(), 5));
});

test("un ajuste de stock para abajo se come los lotes igual que en el origen", () => {
  const baja = ev({ productId: "yogur", delta: -3, reason: "ajuste" }, { type: "stock" });
  const sube = ev({ productId: "yogur", delta: 2, reason: "ajuste" }, { type: "stock" });
  const antes = payload({ products: [conLotes()] });
  assert.deepEqual(applyEvent(antes, baja).products[0], consumeFifo(conLotes(), 3));
  // Para arriba es stock sin fecha: los lotes no se tocan.
  const subido = applyEvent(antes, sube).products[0];
  assert.equal(subido?.stock, 12);
  assert.deepEqual(subido?.lots, conLotes().lots);
});

test("una venta guardada antes de este cambio se sigue aplicando igual", () => {
  // Como venían antes: sin costo en el renglón y un producto con fecha pero sin lotes.
  const viejo = ev(
    {
      id: "v_vieja",
      createdAt: "2026-09-10T12:00:00.000Z",
      paymentMethod: "debito",
      note: "",
      total: 2800,
      paid: null,
      items: [
        { productId: "leche", name: "Leche", price: 1400, qty: 2 },
        { productId: "no-existe", name: "Borrado", price: 100, qty: 1 },
      ],
    },
    { id: "ev_vieja", type: "sale" },
  );
  const leche = { ...conLotes(), id: "leche", lots: undefined, expiresAt: "2026-09-22" };
  const next = applyEvent(payload({ products: [leche] }), viejo);
  assert.equal(next.sales.length, 1);
  assert.equal(next.products[0]?.stock, 8);
  assert.equal(next.products[0]?.expiresAt, "2026-09-22");
  assert.equal(next.products[0]?.lots, undefined);
});

test("vender de un producto con fecha pero sin lotes no le borra la fecha", () => {
  const sinLotes = { ...conLotes(), lots: [], expiresAt: "2026-09-22" };
  const vendido = consumeFifo(sinLotes, 1);
  assert.equal(vendido.expiresAt, "2026-09-22");
  assert.equal(vendido.stock, 9);
});
