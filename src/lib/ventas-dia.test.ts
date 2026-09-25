import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { desdeVentasVivas, ventasPorDia } from "./ventas-dia.ts";

const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe("ventasPorDia", () => {
  it("días recientes: suma las ventas; sin ventas es cero", () => {
    const r = ventasPorDia(
      "2026-09",
      [{ createdAt: local(2026, 9, 22), total: 100 }, { createdAt: local(2026, 9, 22, 18), total: 50 }],
      [],
      { hoy: "2026-09-24", desdeVivas: "2026-09-18" },
    );
    assert.equal(r[21], 150);
    assert.equal(r[22], 0);
    assert.equal(r[23], 0);
    assert.equal(r[24], null);
  });

  it("días viejos: usan los turnos cerrados; sin turno queda sin dato", () => {
    const r = ventasPorDia(
      "2026-09",
      [],
      [
        { openedAt: local(2026, 9, 3, 8), status: "closed", salesTotal: 1000 },
        { openedAt: local(2026, 9, 3, 15), status: "closed", salesTotal: 500 },
        { openedAt: local(2026, 9, 4, 8), status: "open", salesTotal: null },
      ],
      { hoy: "2026-09-24", desdeVivas: "2026-09-18" },
    );
    assert.equal(r[2], 1500);
    assert.equal(r[3], null);
    assert.equal(r[0], null);
  });

  it("no cuenta dos veces: en los días recientes mandan las ventas, no el turno", () => {
    const r = ventasPorDia(
      "2026-09",
      [{ createdAt: local(2026, 9, 20), total: 300 }],
      [{ openedAt: local(2026, 9, 20, 8), status: "closed", salesTotal: 300 }],
      { hoy: "2026-09-24", desdeVivas: "2026-09-18" },
    );
    assert.equal(r[19], 300);
  });

  it("el mes tiene sus días: febrero 28", () => {
    assert.equal(ventasPorDia("2026-02", [], [], { hoy: "2026-09-24", desdeVivas: "2026-09-18" }).length, 28);
  });
});

describe("desdeVentasVivas", () => {
  it("sin llegar al tope, el corte de 7 días", () => {
    assert.equal(desdeVentasVivas([], { hoy: new Date(2026, 8, 24, 12), dias: 7, tope: 1500 }), "2026-09-18");
  });
  it("con la lista al tope, desde el día siguiente a la venta más vieja", () => {
    const sales = [{ createdAt: local(2026, 9, 21) }, { createdAt: local(2026, 9, 23) }];
    assert.equal(desdeVentasVivas(sales, { hoy: new Date(2026, 8, 24, 12), dias: 7, tope: 2 }), "2026-09-22");
  });
});
