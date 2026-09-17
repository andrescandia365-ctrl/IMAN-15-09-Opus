import { strict as assert } from "node:assert";
import { test } from "node:test";
import { applyEvent, type ImanEvent } from "./events.ts";
import type { Category, KioskPayload, Settings, Supplier } from "./types.ts";

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
