import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backupRecords, incomingCopy, mergeBackup, mergeOrders, mergePayload, richerOrder, richerShift } from "./cap.ts";
import { haceCuanto, pruneSyncLog, trimSyncLog, type SyncLogItem } from "./sync-log.ts";
import type { CashShift, KioskPayload, MonthAgg, OrderDraft, Sale, Settings } from "./types.ts";

const settings = { name: "Faro", city: "", onboarded: true } as Settings;

function order(partial: Partial<OrderDraft> & Pick<OrderDraft, "id">): OrderDraft {
  return {
    supplierId: "s-omar",
    supplierName: "Omar",
    lines: [{ productId: "p1", name: "Coca 2L", qty: 2, asUnit: false }],
    text: "Pedido Omar",
    createdAt: "2026-04-01T12:00:00.000Z",
    sent: true,
    received: false,
    ...partial,
  };
}

function payload(partial: Partial<KioskPayload>): KioskPayload {
  return {
    products: [{ id: "p1", name: "Coca 2L", barcode: "1", price: 100, cost: 50, stock: 4, stockMin: 2, categoryId: "kio", active: true, expiresAt: null, priceUpdatedAt: "2026-04-01T00:00:00.000Z" }],
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

describe("mergeOrders", () => {
  it("keeps the PC sent order when the phone copy has none", () => {
    const pc = [order({ id: "or1" })];
    const phone: OrderDraft[] = [];
    const merged = mergeOrders(pc, phone);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.supplierName, "Omar");
    assert.equal(merged[0]?.lines[0]?.name, "Coca 2L");
    assert.equal(merged[0]?.lines[0]?.asUnit, false);
  });

  it("prefers the piece with renglones over an empty title", () => {
    const empty = order({ id: "or1", supplierName: "", lines: [] });
    const full = order({ id: "or1" });
    const got = richerOrder(empty, full);
    assert.equal(got.supplierName, "Omar");
    assert.equal(got.lines.length, 1);
  });
});

describe("incomingCopy", () => {
  it("does not replace a live local with an empty cloud", () => {
    const local = payload({ orders: [] });
    const remote = payload({ products: [], sales: [], orders: [] });
    const got = incomingCopy(remote, local);
    assert.equal(got.emptyRemote, true);
    assert.equal(got.newOrders, 0);
    assert.equal(got.payload.products.length, 1);
  });

  it("counts a new sent order from the cloud", () => {
    const local = payload({ orders: [] });
    const remote = payload({ orders: [order({ id: "or1" })] });
    const got = incomingCopy(remote, local);
    assert.equal(got.emptyRemote, false);
    assert.equal(got.newOrders, 1);
    assert.equal(got.payload.orders[0]?.lines[0]?.qty, 2);
  });
});

describe("pruneSyncLog", () => {
  it("drops events older than 2 days", () => {
    const now = Date.parse("2026-04-10T12:00:00.000Z");
    const rows: SyncLogItem[] = [
      {
        id: "a",
        at: "2026-04-09T12:00:00.000Z",
        kind: "order",
        title: "Pedido a Omar",
        detail: "subiendo a la nube",
        status: "done",
      },
      {
        id: "b",
        at: "2026-04-07T11:00:00.000Z",
        kind: "empty",
        title: "Nada nuevo en la nube",
        detail: "listo",
        status: "done",
      },
    ];
    const kept = pruneSyncLog(rows, now);
    assert.deepEqual(
      kept.map((x) => x.id),
      ["a"],
    );
  });
});

describe("líneas que no vencen", () => {
  const now = Date.parse("2026-09-18T12:00:00.000Z");
  const linea = (id: string, at: string, keep = false): SyncLogItem => ({
    id,
    at,
    kind: "pull",
    title: id,
    detail: "listo",
    status: "done",
    ...(keep ? { keep: true } : {}),
  });

  it("el punto de partida sigue ahí meses después; lo común se borra a los 2 días", () => {
    const rows = [linea("nuevo", "2026-09-18T11:00:00.000Z"), linea("viejo", "2026-09-01T12:00:00.000Z"), linea("arranque", "2026-03-18T12:00:00.000Z", true)];
    assert.deepEqual(
      pruneSyncLog(rows, now).map((x) => x.id),
      ["nuevo", "arranque"],
    );
  });

  it("el tope de 40 líneas no se come al punto de partida", () => {
    const muchas = Array.from({ length: 45 }, (_, i) => linea(`l${i}`, "2026-09-18T11:00:00.000Z"));
    const rows = [...muchas, linea("arranque", "2026-03-18T12:00:00.000Z", true)];
    const quedan = trimSyncLog(rows, now);
    assert.equal(quedan.length, 41);
    assert.equal(quedan.at(-1)?.id, "arranque");
  });
});

describe("juntar la fotocopia con la copia del aparato no cuenta plata dos veces", () => {
  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();
  const agosto: MonthAgg = { ym: "2026-08", ventas: 1000, tickets: 10, mp: 0, efectivo: 1000, debito: 0, cogs: 500 };
  const venta = (id: string, dias: number): Sale => ({
    id,
    createdAt: hace(dias),
    paymentMethod: "efectivo",
    note: "",
    total: 100,
    paid: null,
    items: [],
  });

  it("dos copias con los mismos meses no los duplican", () => {
    const r = mergePayload(payload({ monthAggs: [agosto] }), payload({ monthAggs: [{ ...agosto }] }));
    assert.equal(r.monthAggs?.find((a) => a.ym === "2026-08")?.ventas, 1000);
    assert.equal(r.monthAggs?.find((a) => a.ym === "2026-08")?.tickets, 10);
  });

  it("recargar muchas veces tampoco", () => {
    let aca = payload({ monthAggs: [agosto] });
    for (let i = 0; i < 5; i++) aca = mergePayload(payload({ monthAggs: [agosto] }), aca);
    assert.equal(aca.monthAggs?.find((a) => a.ym === "2026-08")?.ventas, 1000);
  });

  it("gana el resumen más completo del mes", () => {
    const masCompleto = { ...agosto, ventas: 1500, tickets: 15 };
    const r = mergePayload(payload({ monthAggs: [masCompleto] }), payload({ monthAggs: [agosto] }));
    assert.equal(r.monthAggs?.find((a) => a.ym === "2026-08")?.ventas, 1500);
  });

  it("una venta vieja que solo tiene la fotocopia no se vuelve a plegar; una nueva sí entra", () => {
    // Este aparato ya plegó la vieja a su resumen; la fotocopia todavía la tenía suelta.
    const mesViejo: MonthAgg = { ym: hace(10).slice(0, 7), ventas: 100, tickets: 1, mp: 0, efectivo: 100, debito: 0, cogs: 0 };
    const fotocopia = payload({ sales: [venta("vieja", 10), venta("nueva", 1)], monthAggs: [] });
    const aca = payload({ sales: [], monthAggs: [mesViejo] });
    const r = mergePayload(fotocopia, aca);
    assert.deepEqual(r.sales.map((s) => s.id), ["nueva"]);
    assert.equal(r.monthAggs?.find((a) => a.ym === mesViejo.ym)?.ventas, 100);
  });
});

describe("respaldo cuando chocan dos fotocopias", () => {
  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();
  const turno = (id: string, status: "open" | "closed", dias: number): CashShift => ({
    id,
    status,
    openingCash: 1000,
    closingCash: status === "closed" ? 5000 : null,
    expectedCash: null,
    salesTotal: null,
    salesCount: null,
    note: null,
    openedAt: hace(dias),
    closedAt: status === "closed" ? hace(dias - 0.3) : null,
  });
  it("los turnos viejos del celu no le borran al respaldo los cierres de la caja", () => {
    const caja = payload({ shifts: [turno("t1", "closed", 1), turno("t2", "open", 0.2)] });
    const celu = payload({ shifts: [turno("t1", "open", 1)] });
    const r = mergeBackup(caja, celu);
    assert.deepEqual(
      r.shifts.map((s) => `${s.id}:${s.status}`),
      ["t2:open", "t1:closed"],
    );
    // Lo mismo queda también en el aparato que sube.
    assert.deepEqual(
      backupRecords(caja, celu).shifts.map((s) => `${s.id}:${s.status}`),
      ["t2:open", "t1:closed"],
    );
  });

  it("retiros e historial se suman de los dos lados", () => {
    const caja = payload({
      drops: [{ id: "d1", shiftId: "t1", amount: 5000, note: "fuerte", createdAt: hace(0.5) }],
      movements: [{ id: "m1", productId: "p1", productName: "Coca 2L", delta: -1, reason: "venta", createdAt: hace(0.4) }],
    });
    const celu = payload({
      drops: [],
      movements: [{ id: "m2", productId: "p1", productName: "Coca 2L", delta: 6, reason: "recepción", createdAt: hace(0.1) }],
    });
    const r = mergeBackup(caja, celu);
    assert.deepEqual(r.drops.map((d) => d.id), ["d1"]);
    assert.deepEqual(r.movements.map((m) => m.id), ["m2", "m1"]);
  });

  it("ajustes y proveedores ya aplicados no los pisa una fotocopia vieja", () => {
    const vieja = payload({
      settings: { ...settings, roundStep: 100 },
      suppliers: [{ id: "s1", name: "Omar", days: [1], notes: "", whatsapp: "" }],
    });
    const aplicado = payload({
      settings: { ...settings, roundStep: 50, priceMarkupsA: { beb: 1.9 } },
      suppliers: [{ id: "s1", name: "Omar Distribuidora", days: [1], notes: "", whatsapp: "" }],
    });
    const r = mergeBackup(vieja, aplicado);
    assert.equal(r.settings.roundStep, 50);
    assert.equal(r.settings.priceMarkupsA?.beb, 1.9);
    assert.equal(r.suppliers[0]?.name, "Omar Distribuidora");
  });

  it("un cierre sin efectivo contado no le gana a un turno abierto", () => {
    // Así cerraba la restauración de una copia los turnos que estaban abiertos.
    const inventado = { ...turno("t1", "open", 0.2), status: "closed" as const, closedAt: hace(0.1) };
    const abierto = turno("t1", "open", 0.2);
    for (const [servidor, local] of [
      [inventado, abierto],
      [abierto, inventado],
    ]) {
      const r = backupRecords({ shifts: [servidor!], drops: [], movements: [] }, { shifts: [local!], drops: [], movements: [] });
      assert.equal(r.shifts[0]?.status, "open");
    }
    // Un cierre de verdad le gana a los dos, del lado que venga.
    const cerrado = { ...turno("t1", "closed", 0.2) };
    for (const otro of [abierto, inventado]) {
      assert.equal(richerShift(otro, cerrado).closingCash, 5000);
      assert.equal(richerShift(cerrado, otro).closingCash, 5000);
    }
  });

  it("los borrados se suman de los dos lados", () => {
    const caja = payload({ deletedProducts: [{ id: "alfajor", at: hace(0.5), name: "Alfajor" }] });
    const celu = payload({ deletedProducts: [{ id: "chicle", at: hace(0.2), name: "Chicle" }] });
    assert.deepEqual(mergeBackup(caja, celu).deletedProducts?.map((d) => d.id), ["chicle", "alfajor"]);
  });

  it("un producto que volvió (catálogo de ejemplo recargado) sale de la lista de la fotocopia", () => {
    const servidor = payload({ deletedProducts: [{ id: "p1", at: hace(3) }, { id: "otro", at: hace(3) }] });
    const recargado = payload({ deletedProducts: [] });
    assert.deepEqual(mergeBackup(servidor, recargado).deletedProducts?.map((d) => d.id), ["otro"]);
  });

  it("un aparato vacío no pisa la fotocopia", () => {
    const servidor = payload({ shifts: [turno("t1", "closed", 1)] });
    const vacio = payload({ products: [], sales: [] });
    const r = mergeBackup(servidor, vacio);
    assert.equal(r.products.length, 1);
    assert.deepEqual(r.shifts.map((s) => s.id), ["t1"]);
  });
});

describe("la última vez que se sincronizó", () => {
  const now = Date.parse("2026-09-18T15:00:00.000Z");
  it("se lee en lenguaje de piso", () => {
    assert.equal(haceCuanto("2026-09-18T14:59:40.000Z", now), "recién");
    assert.equal(haceCuanto("2026-09-18T14:35:00.000Z", now), "hace 25 min");
    assert.equal(haceCuanto("2026-09-18T13:00:00.000Z", now), "hace 2 h");
    assert.equal(haceCuanto("2026-09-15T15:00:00.000Z", now), "hace 3 días");
  });
});
