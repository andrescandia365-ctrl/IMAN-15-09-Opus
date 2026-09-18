import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { incomingCopy, mergeOrders, mergePayload, richerOrder } from "./cap.ts";
import { pruneSyncLog, trimSyncLog, type SyncLogItem } from "./sync-log.ts";
import type { KioskPayload, MonthAgg, OrderDraft, Sale, Settings } from "./types.ts";

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
