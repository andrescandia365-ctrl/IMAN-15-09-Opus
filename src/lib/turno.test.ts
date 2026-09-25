import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cerradoPorOtro, devolucionesDelTurno, turnosAbiertos, ventasDelTurno } from "./turno.ts";
import type { Refund, Sale } from "./types.ts";

function venta(id: string, createdAt: string, shiftId?: string): Sale {
  return { id, createdAt, paymentMethod: "efectivo", note: "", total: 100, paid: 100, items: [], ...(shiftId ? { shiftId } : {}) };
}

const turnoA = { id: "sh_a", openedAt: "2026-09-23T08:00:00.000Z" };
const turnoB = { id: "sh_b", openedAt: "2026-09-23T09:00:00.000Z" };

describe("ventasDelTurno", () => {
  it("las ventas viejas, sin turno, cuentan por hora como siempre", () => {
    const ventas = [venta("antes", "2026-09-23T07:59:00.000Z"), venta("despues", "2026-09-23T08:30:00.000Z")];
    assert.deepEqual(ventasDelTurno(ventas, turnoA).map((s) => s.id), ["despues"]);
  });

  it("dos aparatos cobrando en el mismo turno: entran las dos", () => {
    const ventas = [venta("pc", "2026-09-23T08:10:00.000Z", "sh_a"), venta("celu", "2026-09-23T08:11:00.000Z", "sh_a")];
    assert.deepEqual(ventasDelTurno(ventas, turnoA).map((s) => s.id), ["pc", "celu"]);
  });

  it("una venta de otro turno no entra aunque sea de después de la apertura", () => {
    const ventas = [venta("mia", "2026-09-23T09:30:00.000Z", "sh_a"), venta("otra caja", "2026-09-23T09:31:00.000Z", "sh_b")];
    assert.deepEqual(ventasDelTurno(ventas, turnoA).map((s) => s.id), ["mia"]);
    assert.deepEqual(ventasDelTurno(ventas, turnoB).map((s) => s.id), ["otra caja"]);
  });

  it("una venta del turno cuenta aunque el reloj de su aparato esté atrasado", () => {
    const ventas = [venta("reloj atrasado", "2026-09-23T07:55:00.000Z", "sh_a")];
    assert.deepEqual(ventasDelTurno(ventas, turnoA).map((s) => s.id), ["reloj atrasado"]);
  });

  it("un aparato sin actualizar mezclado con uno nuevo: la vieja cuenta por hora", () => {
    const ventas = [venta("nueva", "2026-09-23T09:10:00.000Z", "sh_a"), venta("vieja", "2026-09-23T09:20:00.000Z")];
    assert.deepEqual(ventasDelTurno(ventas, turnoA).map((s) => s.id), ["nueva", "vieja"]);
    assert.deepEqual(ventasDelTurno(ventas, turnoB).map((s) => s.id), ["vieja"]);
  });
});

function devolucion(id: string, createdAt: string, extra: Partial<Refund> = {}): Refund {
  return { id, kind: "cliente", createdAt, productId: "p1", productName: "X", units: 1, packs: 0, amount: 100, paymentMethod: "efectivo", note: "", ...extra };
}

describe("devolucionesDelTurno", () => {
  it("las viejas, sin turno, cuentan por hora como siempre", () => {
    const rf = [devolucion("antes", "2026-09-23T07:59:00.000Z"), devolucion("despues", "2026-09-23T08:30:00.000Z")];
    assert.deepEqual(devolucionesDelTurno(rf, turnoA).map((r) => r.id), ["despues"]);
  });

  it("una devolución de otro turno no entra aunque sea de después", () => {
    const rf = [devolucion("mia", "2026-09-23T09:30:00.000Z", { shiftId: "sh_a" }), devolucion("otra", "2026-09-23T09:31:00.000Z", { shiftId: "sh_b" })];
    assert.deepEqual(devolucionesDelTurno(rf, turnoA).map((r) => r.id), ["mia"]);
  });

  it("lo devuelto al proveedor no es plata del cajón", () => {
    const rf = [devolucion("prov", "2026-09-23T09:30:00.000Z", { kind: "proveedor" })];
    assert.deepEqual(devolucionesDelTurno(rf, turnoA), []);
  });
});

describe("turnosAbiertos", () => {
  it("abierto en la fotocopia y sin cierre en la cinta: sigue abierto", () => {
    assert.deepEqual(turnosAbiertos([{ id: "t1", status: "open", deviceId: "pc" }], []), [{ id: "t1", deviceId: "pc" }]);
  });

  it("cerrado en la cinta aunque la fotocopia lo tenga abierto: cerrado", () => {
    const r = turnosAbiertos([{ id: "t1", status: "open" }], [{ op: "close", shift: { id: "t1", status: "closed" } }]);
    assert.deepEqual(r, []);
  });

  it("cerrado en la fotocopia y con la apertura en la cinta: cerrado, no se reabre", () => {
    const r = turnosAbiertos([{ id: "t1", status: "closed" }], [{ op: "open", shift: { id: "t1", status: "open" } }]);
    assert.deepEqual(r, []);
  });

  it("abierto solo en la cinta, con el aparato que lo abrió", () => {
    const r = turnosAbiertos([], [{ op: "open", shift: { id: "t2", status: "open", deviceId: "celu" } }]);
    assert.deepEqual(r, [{ id: "t2", deviceId: "celu" }]);
  });
});

describe("cerradoPorOtro", () => {
  it("lo cerró el mismo aparato que lo abrió: no se marca", () => {
    assert.equal(cerradoPorOtro({ deviceId: "pc", closedBy: "pc" }), false);
  });

  it("lo cerró otro aparato (toma forzada): se marca", () => {
    assert.equal(cerradoPorOtro({ deviceId: "pc", closedBy: "celu" }), true);
  });

  it("heredado, aunque no se sepa quién lo abrió: se marca", () => {
    assert.equal(cerradoPorOtro({ closedBy: "celu", heredado: true }), true);
  });

  it("un turno de antes, sin alguno de los dos datos: no se marca", () => {
    assert.equal(cerradoPorOtro({ closedBy: "celu" }), false);
    assert.equal(cerradoPorOtro({ deviceId: "pc" }), false);
  });
});
