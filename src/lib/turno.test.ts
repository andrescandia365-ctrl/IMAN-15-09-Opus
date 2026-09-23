import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ventasDelTurno } from "./turno.ts";
import type { Sale } from "./types.ts";

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
