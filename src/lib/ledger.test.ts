import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  archiveClosedMonths,
  cellValue,
  depositLedgerAmounts,
  emptyBook,
  ledgerRowsForYm,
  monthCc,
  resolveLedgerRows,
  sameCell,
  takeMonthExpenses,
  visibleLedgerRows,
} from "./ledger.ts";
import type { DayBook, LedgerRow, MonthSheet } from "./types.ts";

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

function conAlquiler(over: Partial<LedgerRow> = {}): LedgerRow[] {
  return [
    ...resolveLedgerRows(),
    { id: "alquiler", label: "Alquiler", kind: "input", tag: "alquiler", ...over },
  ];
}

describe("TOTAL PROVEEDORES suma por tag, no por id ni por el nombre", () => {
  const hoy = "2026-09-10";
  const rows = resolveLedgerRows();
  const renamed = rows.map((r) => (r.id === "fac_a" ? { ...r, label: "Factura A del mayorista" } : r));

  it("si el dueño renombra Fac A, el total no se rompe", () => {
    const books: DayBook[] = [
      {
        ...emptyBook(hoy),
        cells: { fac_x: 5000, fac_a: 12000, cigarrillos: 3000 },
      },
    ];
    assert.equal(cellValue(books, hoy, "total_proveedores", renamed), 20000);
    assert.equal(monthCc(books, "2026-09", renamed).proveedores, 20000);
    const facA = monthCc(books, "2026-09", renamed).proveedorRows.find((r) => r.id === "fac_a");
    assert.equal(facA?.label, "Factura A del mayorista");
    assert.equal(facA?.amount, 12000);
  });

  it("una fila nueva con tag proveedor entra en el total", () => {
    const rows2 = [...renamed, { id: "golosinas_prov", label: "Golosinas", kind: "input" as const, tag: "proveedor" }];
    const books: DayBook[] = [
      {
        ...emptyBook(hoy),
        cells: { fac_x: 5000, fac_a: 12000, cigarrillos: 3000, golosinas_prov: 4000 },
      },
    ];
    assert.equal(cellValue(books, hoy, "total_proveedores", rows2), 24000);
  });
});

describe("ocultar Alquiler no pierde el mes archivado", () => {
  const marzo: MonthSheet = {
    ym: "2026-03",
    archivedAt: "2026-04-01T12:00:00.000Z",
    rows: conAlquiler(),
    days: [{ date: "2026-03-05", cells: { alquiler: 150000, fac_x: 1000 } }],
  };
  const ahora = new Date(2026, 8, 19);
  const ocultas = conAlquiler({ hidden: true });

  it("abrir marzo muestra Alquiler con 150.000 aunque ahora esté oculta", () => {
    const view = ledgerRowsForYm("2026-03", { ledgerRows: ocultas }, [marzo], ahora);
    const fila = view.find((r) => r.id === "alquiler");
    assert.equal(fila?.label, "Alquiler");
    assert.equal(Boolean(fila?.hidden), false);
    const books = [
      { ...emptyBook("2026-03-05"), cells: { alquiler: 150000, fac_x: 1000 } },
    ];
    assert.equal(cellValue(books, "2026-03-05", "alquiler", view), 150000);
    assert.equal(monthCc(books, "2026-03", view).gastos, 150000);
  });

  it("en el mes de ahora Alquiler no se ve", () => {
    const vivas = visibleLedgerRows(resolveLedgerRows({ ledgerRows: ocultas }));
    assert.equal(
      vivas.some((r) => r.id === "alquiler"),
      false,
    );
  });

  it("al archivar, el mes se lleva las filas de entonces", () => {
    const books: DayBook[] = [
      { ...emptyBook("2026-03-05"), cells: { alquiler: 150000 } },
    ];
    const { monthSheets } = archiveClosedMonths(books, [], conAlquiler(), ahora);
    const sheet = monthSheets.find((s) => s.ym === "2026-03");
    assert.ok(sheet?.rows?.some((r) => r.id === "alquiler" && r.label === "Alquiler"));
    assert.equal(sheet?.days[0]?.cells.alquiler, 150000);
  });
});

describe("el alquiler no descuadra el efectivo y El mes lo toma de la fila", () => {
  const hoy = "2026-09-01";
  const rows = conAlquiler();
  const books: DayBook[] = [
    {
      ...emptyBook(hoy),
      cells: { caja: 10000, fac_x: 2000, alquiler: 150000, gasto_1: 500 },
    },
  ];

  it("TOTAL VENTAS no suma el alquiler (no es plata de caja)", () => {
    const sinAlquiler = cellValue(books, hoy, "total_ventas", resolveLedgerRows());
    const con = cellValue(books, hoy, "total_ventas", rows);
    assert.equal(con, sinAlquiler);
    assert.equal(con, 10000 + 2000 + 500);
  });

  it("Gastos de El mes sí suma alquiler y gasto", () => {
    assert.equal(monthCc(books, "2026-09", rows).gastos, 150500);
  });
});

describe("los gastos fijos de settings pasan a filas una sola vez", () => {
  it("Alquiler 150.000 aterriza en la fila y no se vuelve a sumar", () => {
    const first = takeMonthExpenses({
      monthExpenses: [
        { name: "Alquiler", amount: 150000 },
        { name: "Luz", amount: 0 },
      ],
    });
    assert.ok(first.rows.some((r) => r.id === "alquiler" && r.tag === "alquiler"));
    assert.ok(first.rows.some((r) => r.label === "Luz" && r.tag === "gasto"));
    assert.deepEqual(first.deposits, [{ rowId: "alquiler", amount: 150000 }]);

    const books = depositLedgerAmounts([], first.deposits, "2026-09");
    assert.equal(cellValue(books, "2026-09-01", "alquiler", first.rows), 150000);
    assert.equal(monthCc(books, "2026-09", first.rows).gastos, 150000);

    const second = takeMonthExpenses({ ledgerRows: first.rows, monthExpenses: [] });
    const otra = depositLedgerAmounts(books, second.deposits, "2026-09");
    assert.equal(cellValue(otra, "2026-09-01", "alquiler", second.rows), 150000);
    assert.equal(monthCc(otra, "2026-09", second.rows).gastos, 150000);
  });
});
