import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { emptyBook, sameCell } from "./ledger.ts";
import type { DayBook } from "./types.ts";

describe("salir de una celda de la planilla sin cambiarla", () => {
  const hoy = "2026-09-18";
  const libro = (cells: Record<string, number>): DayBook => ({ ...emptyBook(hoy), cells });

  it("con el mismo valor no hay nada que guardar", () => {
    assert.equal(sameCell([libro({ proveedores: 12000 })], hoy, "proveedores", 12000), true);
  });

  it("una celda vacía vale 0: recorrerla con las flechas no escribe nada", () => {
    assert.equal(sameCell([libro({})], hoy, "gastos", 0), true);
    assert.equal(sameCell([], hoy, "gastos", 0), true);
  });

  it("un valor distinto sí se guarda", () => {
    assert.equal(sameCell([libro({ proveedores: 12000 })], hoy, "proveedores", 15000), false);
    assert.equal(sameCell([libro({})], hoy, "gastos", 500), false);
  });

  it("las celdas viejas que vivían en campos sueltos también cuentan", () => {
    const viejo: DayBook = { ...emptyBook(hoy), facA: 3000, cells: {} };
    assert.equal(sameCell([viejo], hoy, "fac_a", 3000), true);
  });
});
