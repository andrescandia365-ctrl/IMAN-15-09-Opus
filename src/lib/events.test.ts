import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  applyEvent,
  applyEvents,
  keepStockAndLots,
  pulledPatch,
  stockCorrection,
  type ImanEvent,
} from "./events.ts";
import { addLot, consumeFifo } from "./lots.ts";
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

test("syncNow saca la categoría borrada también de los proveedores del otro aparato", () => {
  const vacia: Category = { id: "c-vacia", name: "Vacía", sort: 3 };
  const antes = payload({
    categories: [...payload().categories, vacia],
    suppliers: [
      supplier({ categoryIds: ["c-bebidas", "c-vacia"] }),
      supplier({ id: "prov-lacteos", name: "Lácteos Juan", categoryIds: ["c-vacia"] }),
    ],
  });
  const alStore = pulledPatch(applyEvents(antes, [ev({ op: "delete", id: "c-vacia" })]));
  assert.deepEqual(
    alStore.suppliers.map((s) => `${s.id}:${(s.categoryIds ?? []).join("+")}`),
    ["prov-omar:c-bebidas", "prov-lacteos:"],
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

// El evento `product` trae catálogo; stock y lotes solo se mueven por cantidad.
function yogurSuelto(stock = 10): Product {
  return { ...conLotes(), lots: [], expiresAt: null, stock };
}

test("carrera: la caja vende 2 y el celu fecha sin saberlo; la caja no recupera los 2", () => {
  // Caja: vendió 2 de 10.
  let caja = applyEvent(payload({ products: [yogurSuelto()] }), venta("v_caja", 2));
  assert.equal(caja.products[0]?.stock, 8);

  // Celu: no vio la venta y fecha 4 al 25/09.
  const fechado = addLot(yogurSuelto(), "2026-09-25", 4);
  assert.ok(fechado.ok);
  if (!fechado.ok) return;
  const loteNuevo = ev(
    { productId: "yogur", lotId: fechado.lot.id, expiresAt: "2026-09-25", units: 4 },
    { id: "ev_lote", type: "lot", deviceId: "dev_celu" },
  );
  // Como mandaba antes el celu: el producto entero, con su stock viejo.
  const productoViejo = ev(fechado.product, { id: "ev_prod_viejo", type: "product", deviceId: "dev_celu" });

  caja = applyEvents(caja, [loteNuevo, productoViejo]);
  assert.equal(caja.products[0]?.stock, 8);
  assert.deepEqual(caja.products[0]?.lots, [{ id: fechado.lot.id, expiresAt: "2026-09-25", units: 4 }]);

  // Celu: le llega la venta de la caja y queda con el mismo stock.
  const celu = applyEvent(payload({ products: [fechado.product] }), venta("v_caja", 2));
  assert.equal(celu.products[0]?.stock, 8);
});

test("editor abierto durante una venta: guardar no devuelve el stock viejo", () => {
  const alAbrir = yogurSuelto(10);
  const copiaDelDialogo = { ...alAbrir, name: "Yogur frutilla" };
  // Mientras el diálogo estaba abierto entró una venta de 2.
  const ahora = consumeFifo(alAbrir, 2);

  // Nadie tocó el campo Stock: no hay corrección y queda la venta descontada.
  assert.equal(stockCorrection(alAbrir.stock, copiaDelDialogo.stock, ahora.stock), 0);
  const guardado = keepStockAndLots(ahora, copiaDelDialogo);
  assert.equal(guardado.stock, 8);
  assert.equal(guardado.name, "Yogur frutilla");
});

test("la corrección a mano viaja como diferencia y no pisa las ventas del otro aparato", () => {
  const alAbrir = yogurSuelto(10);
  const ahora = consumeFifo(alAbrir, 2); // 8 en la PC
  const delta = stockCorrection(alAbrir.stock, 15, ahora.stock);
  assert.equal(delta, 7); // queda escrito 15

  const correccion = ev({ productId: "yogur", delta, reason: "corrección manual" }, { id: "ev_corr", type: "stock" });
  const producto = ev({ ...ahora, stock: 15 }, { id: "ev_prod", type: "product" });

  // Un aparato que estaba en 8 queda en 15, como la PC.
  const igual = applyEvents(payload({ products: [yogurSuelto(8)] }), [correccion, producto]);
  assert.equal(igual.products[0]?.stock, 15);
  // Uno que ya había vendido 1 más queda con esa venta descontada: 14, no 15.
  const otro = applyEvents(payload({ products: [yogurSuelto(7)] }), [correccion, producto]);
  assert.equal(otro.products[0]?.stock, 14);
  // Sin tocar el campo, nunca hay corrección.
  assert.equal(stockCorrection(null, 15, 8), 0);
});

test("aplicar precios no toca el stock del que recibe", () => {
  const desdeLaPc = { ...conLotes(), stock: 40, price: 1600, lots: [] };
  const celu = applyEvent(payload({ products: [conLotes()] }), ev(desdeLaPc, { id: "ev_precio", type: "product" }));
  assert.equal(celu.products[0]?.price, 1600);
  assert.equal(celu.products[0]?.stock, 10);
  assert.deepEqual(celu.products[0]?.lots, conLotes().lots);
  assert.equal(celu.products[0]?.expiresAt, "2026-09-20");
});

test("la fecha de un producto sin lotes viaja como catálogo", () => {
  const editado = { ...yogurSuelto(10), expiresAt: "2026-10-01" };
  const otro = applyEvent(payload({ products: [yogurSuelto(6)] }), ev(editado, { id: "ev_fecha", type: "product" }));
  assert.equal(otro.products[0]?.expiresAt, "2026-10-01");
  assert.equal(otro.products[0]?.stock, 6);
});

test("fechar el mismo lote dos veces no lo duplica", () => {
  const lote = ev(
    { productId: "yogur", lotId: "lt_nuevo", expiresAt: "2026-09-30", units: 2 },
    { id: "ev_lote_x", type: "lot" },
  );
  const una = applyEvent(payload({ products: [conLotes()] }), lote);
  const dos = applyEvent(una, lote);
  assert.equal(dos.products[0]?.lots?.length, 3);
  assert.deepEqual(dos.products[0], una.products[0]);
  // Fechar no mueve el stock.
  assert.equal(dos.products[0]?.stock, 10);
});

test("un alta llega entera, con su stock inicial", () => {
  const nuevo = { ...yogurSuelto(5), id: "nuevo", name: "Flan" };
  const otro = applyEvent(payload({ products: [conLotes()] }), ev(nuevo, { id: "ev_alta", type: "product" }));
  assert.deepEqual(otro.products.find((p) => p.id === "nuevo"), nuevo);
});

test("los eventos con el formato viejo se aplican sin error", () => {
  const antes = payload({ products: [conLotes()] });
  // Un `product` viejo de fechar: producto entero con stock y lotes adentro.
  const viejo = ev(
    { ...conLotes(), stock: 99, lots: [{ id: "lt_z", expiresAt: "2026-12-01", units: 99 }], expiresAt: "2026-12-01" },
    { id: "ev_viejo", type: "product" },
  );
  const next = applyEvent(antes, viejo);
  assert.equal(next.products[0]?.stock, 10);
  assert.deepEqual(next.products[0]?.lots, conLotes().lots);
  assert.equal(next.products[0]?.expiresAt, "2026-09-20");
  // Un `lot` incompleto no toca nada.
  for (const body of [{}, { productId: "yogur" }, { productId: "yogur", lotId: "x", expiresAt: "2026-10-01", units: 0 }]) {
    assert.equal(applyEvent(antes, ev(body, { type: "lot" })), antes);
  }
});

test("un borrado deja rastro: qué producto, cuándo y desde qué aparato", () => {
  const next = applyEvent(
    payload({ products: [conLotes()] }),
    ev({ id: "yogur" }, { id: "ev_borrar", type: "product.delete", at: "2026-09-18T15:00:00.000Z", deviceId: "dev_pc" }),
  );
  assert.equal(next.products.length, 0);
  assert.deepEqual(next.deletedProducts, [
    { id: "yogur", at: "2026-09-18T15:00:00.000Z", device: "dev_pc", name: "Yogur" },
  ]);
  assert.deepEqual(pulledPatch(next).deletedProducts, next.deletedProducts);
});

test("un cambio de precio que llega después del borrado no revive el producto", () => {
  const borrar = ev({ id: "yogur" }, { id: "ev_borrar", type: "product.delete" });
  const precio = ev({ ...conLotes(), price: 1600 }, { id: "ev_precio_viejo", type: "product", deviceId: "dev_celu" });
  // En cualquier orden que lleguen, el producto queda borrado.
  assert.equal(applyEvents(payload({ products: [conLotes()] }), [borrar, precio]).products.length, 0);
  assert.equal(applyEvents(payload({ products: [conLotes()] }), [precio, borrar]).products.length, 0);
  // Un aparato que arranca de una fotocopia con la lista tampoco lo revive.
  const recuperado = payload({ deletedProducts: [{ id: "yogur", at: "2026-09-18T15:00:00.000Z" }] });
  assert.equal(applyEvent(recuperado, precio).products.length, 0);
  // Un producto que no está en la lista sigue entrando con su evento.
  const otro = ev({ ...yogurSuelto(3), id: "flan", name: "Flan" }, { id: "ev_flan", type: "product" });
  assert.deepEqual(applyEvent(recuperado, otro).products.map((p) => p.id), ["flan"]);
});

test("si el producto está (se recargó el ejemplo), la lista no le frena los cambios", () => {
  const conLista = payload({
    products: [conLotes()],
    deletedProducts: [{ id: "yogur", at: "2026-09-18T15:00:00.000Z" }],
  });
  const next = applyEvent(conLista, ev({ ...conLotes(), price: 1600 }, { id: "ev_precio", type: "product" }));
  assert.equal(next.products[0]?.price, 1600);
});
