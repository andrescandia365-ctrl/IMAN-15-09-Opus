import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergePayload, prunePayload, SALES_KEEP } from "./cap.ts";
import { applyEvents } from "./events.ts";
import type { CashShift, KioskPayload, Sale, Settings } from "./types.ts";

// El resumen del mes con varios aparatos (plegado.ts). "Tickets del mes" es la
// cuenta de Dueño → Mes: los tickets sueltos más los plegados.

const settings = { name: "Faro", city: "", onboarded: true } as Settings;
const DIA = 86_400_000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA).toISOString();

function turno(deviceId: string | undefined, dias: number): CashShift {
  return {
    id: `sh_${deviceId ?? "viejo"}_${dias}`,
    status: "open",
    ...(deviceId ? { deviceId } : {}),
    openingCash: 0,
    closingCash: null,
    expectedCash: null,
    salesTotal: null,
    salesCount: null,
    note: null,
    openedAt: hace(dias),
    closedAt: null,
  };
}

function venta(id: string, dias: number, deviceId?: string): Sale {
  return { id, createdAt: hace(dias), paymentMethod: "efectivo", note: "", total: 100, paid: 100, items: [], ...(deviceId ? { deviceId } : {}) };
}

function aparato(sales: Sale[], shifts: CashShift[]): KioskPayload {
  return {
    products: [{ id: "p1", name: "X", barcode: "1", price: 100, cost: 50, stock: 4, stockMin: 2, categoryId: "k", active: true, expiresAt: null, priceUpdatedAt: hace(60) }],
    categories: [],
    sales,
    settings,
    suppliers: [],
    shifts,
    drops: [],
    orders: [],
    movements: [],
    ticket: [],
    payMethod: "efectivo",
  };
}

/** Tickets de todo lo que hay, sueltos más plegados. */
function tickets(p: KioskPayload): number {
  return p.sales.length + (p.monthAggs ?? []).reduce((a, m) => a + m.tickets, 0);
}

const llega = (p: KioskPayload, s: Sale, desde: string, dev: string) =>
  prunePayload(applyEvents(p, [{ id: `ev_${s.id}`, at: s.createdAt, deviceId: desde, storeId: "s1", type: "sale", body: s as never }]), dev);

describe("resumen del mes con varios aparatos", () => {
  it("una sola caja: el celu estuvo una semana sin Sincronizar y no cuenta dos veces", () => {
    const turnos = [turno("pc", 12)];
    const a1 = venta("a1", 10, "pc");
    const pc = prunePayload(aparato([a1], turnos), "pc");
    const celu = prunePayload(aparato([], turnos), "celu");
    const celu2 = mergePayload(pc, celu, "celu"); // arranca con la fotocopia de la PC
    const celu3 = llega(celu2, a1, "pc", "celu"); // y después baja la cinta
    assert.equal(tickets(celu3), 1);
  });

  it("dos que cobran: el que no pliega adopta el resumen y la venta que llega tarde no suma", () => {
    const turnos = [turno("a", 12)];
    const a1 = venta("a1", 10, "a");
    const b1 = venta("b1", 10, "b");
    const A = prunePayload(aparato([a1, b1], turnos), "a"); // A ya bajó b1
    const B = prunePayload(aparato([b1], turnos), "b"); // B no bajó a1
    const B2 = mergePayload(A, B, "b");
    const B3 = llega(B2, a1, "a", "b");
    assert.equal(tickets(B3), 2);
  });

  it("dos que cobran: una venta que la caja todavía no bajó no se pierde al juntar", () => {
    const turnos = [turno("a", 12)];
    const b1 = venta("b1", 11, "b"); // más vieja que lo que A ya plegó
    const a2 = venta("a2", 9, "a");
    const A = prunePayload(aparato([a2], turnos), "a"); // A no tiene b1
    const B = prunePayload(aparato([b1], turnos), "b"); // B no pliega: la guarda
    assert.equal(B.sales.length, 1);
    const B2 = mergePayload(A, B, "b"); // la marca de A no cubre lo de B
    assert.equal(tickets(B2), 2);
    const A2 = mergePayload(B2, A, "a"); // A baja la fotocopia de B y pliega b1
    assert.equal(tickets(A2), 2);
    const B3 = mergePayload(A2, B2, "b"); // B adopta: b1 ya está en el resumen
    assert.equal(tickets(B3), 2);
    assert.equal(B3.sales.length, 0);
  });

  it("el celu que era la caja se rompe y la PC abre un turno nuevo: no se pierde ni se duplica nada", () => {
    const viejo = [turno("celu", 20)];
    const plegadas = [venta("c1", 15, "celu"), venta("c2", 12, "celu")];
    const recientes = [venta("c3", 5, "celu"), venta("c4", 3, "celu")];
    // Lo último que subió el celu: c1 y c2 plegadas, c3 y c4 sueltas.
    const celu = prunePayload(aparato([...plegadas, ...recientes], viejo), "celu");
    assert.equal(celu.sales.length, 2);
    // La PC las tiene todas en la lista (bajó la cinta) y no pliega.
    const pc = prunePayload(aparato([...plegadas, ...recientes], viejo), "pc");
    const pc2 = mergePayload(celu, pc, "pc");
    assert.equal(tickets(pc2), 4);
    // Abre un turno: ahora pliega ella. Pasan los días y c3, c4 envejecen.
    const pc3 = prunePayload({ ...pc2, shifts: [turno("pc", 1), ...pc2.shifts], sales: pc2.sales.map((s) => ({ ...s, createdAt: hace(10) })) }, "pc");
    assert.equal(pc3.sales.length, 0);
    assert.equal(tickets(pc3), 4);
  });

  it("el celu que era la caja se rompe y nadie abrió otro turno: la PC no descarta, ni pasando el tope", () => {
    const viejo = [turno("celu", 30)];
    const muchas = Array.from({ length: SALES_KEEP + 50 }, (_, i) => venta(`c${i}`, 8 + (i % 10), "celu"));
    const pc = prunePayload(aparato(muchas, viejo), "pc");
    assert.equal(pc.sales.length, SALES_KEEP + 50);
    assert.equal(tickets(pc), SALES_KEEP + 50);
  });

  it("la caja pasa el tope: pliega lo que sobra y no pierde nada", () => {
    const turnos = [turno("pc", 1)];
    const muchas = Array.from({ length: SALES_KEEP + 50 }, (_, i) => venta(`p${i}`, i % 5, "pc"));
    const pc = prunePayload(aparato(muchas, turnos), "pc");
    assert.equal(pc.sales.length, SALES_KEEP);
    assert.equal(tickets(pc), SALES_KEEP + 50);
  });

  it("ventas de antes, sin aparato: pliega la caja y cuentan una vez", () => {
    const turnos = [turno("pc", 12)];
    const v1 = venta("v1", 10);
    const pc = prunePayload(aparato([v1], turnos), "pc");
    const celu = prunePayload(aparato([v1], turnos), "celu");
    const celu2 = mergePayload(pc, celu, "celu");
    assert.equal(tickets(celu2), 1);
    assert.equal(tickets(llega(celu2, v1, "pc", "celu")), 1);
  });

  it("turno de antes, sin aparato: nadie pliega y nadie descarta hasta el próximo turno", () => {
    const turnos = [turno(undefined, 12)];
    const v1 = venta("v1", 10, "pc");
    const pc = prunePayload(aparato([v1], turnos), "pc");
    assert.equal(pc.sales.length, 1);
    assert.equal(tickets(pc), 1);
  });

  it("guardar dos veces no pliega dos veces", () => {
    const turnos = [turno("pc", 12)];
    const pc = prunePayload(aparato([venta("a1", 10, "pc")], turnos), "pc");
    assert.equal(tickets(prunePayload(pc, "pc")), 1);
  });
});
