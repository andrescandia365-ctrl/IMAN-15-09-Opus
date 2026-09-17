import type { DayBook, MonthSheet } from "@/lib/types";
import { todayKey } from "./format.ts";

export type LedgerKind = "input" | "formula" | "spacer";

export const LOCKED_LEDGER = new Set(["saldo_inicial", "total_proveedores", "total_ventas"]);

export function rowTitle(
  row: LedgerRow,
  labels?: Record<string, string>,
): string {
  const custom = labels?.[row.id]?.trim();
  if (custom) return custom;
  return row.label;
}

export type LedgerRow = {
  id: string;
  label: string;
  kind: LedgerKind;
};

/** Caja to square + empty named gastos. Not Aylen's people. */
export const LEDGER_ROWS: LedgerRow[] = [
  { id: "saldo_inicial", label: "SALDO INICIAL", kind: "formula" },
  { id: "fac_x", label: "FAC X", kind: "input" },
  { id: "fac_a", label: "FAC A", kind: "input" },
  { id: "cigarrillos", label: "CIGARRILLOS", kind: "input" },
  { id: "caja", label: "CAJA", kind: "input" },
  { id: "ventas_virtuales", label: "VENTAS VIRTUALES", kind: "input" },
  { id: "pagos_virtuales", label: "PAGOS VIRTUALES", kind: "input" },
  { id: "total_proveedores", label: "TOTAL PROVEEDORES", kind: "formula" },
  { id: "total_ventas", label: "TOTAL VENTAS", kind: "formula" },
  { id: "retiros", label: "RETIROS", kind: "input" },
  { id: "sp1", label: "", kind: "spacer" },
  { id: "gasto_1", label: "", kind: "input" },
  { id: "gasto_2", label: "", kind: "input" },
  { id: "gasto_3", label: "", kind: "input" },
  { id: "gasto_4", label: "", kind: "input" },
  { id: "gasto_5", label: "", kind: "input" },
  { id: "gasto_6", label: "", kind: "input" },
  { id: "gasto_7", label: "", kind: "input" },
  { id: "gasto_8", label: "", kind: "input" },
];

const GASTO_IDS = [
  "gasto_1",
  "gasto_2",
  "gasto_3",
  "gasto_4",
  "gasto_5",
  "gasto_6",
  "gasto_7",
  "gasto_8",
] as const;

export const FAC_LINES = [
  { id: "fac_x", label: "FAC X" },
  { id: "fac_a", label: "FAC A" },
  { id: "cigarrillos", label: "Cigarrillos" },
] as const;

export type FacLine = (typeof FAC_LINES)[number]["id"];

export type LedgerTint = "sage" | "warn" | "danger" | "info";

export const LEDGER_TINTS: { id: LedgerTint; label: string; swatch: string; cell: string }[] = [
  { id: "sage", label: "Verde", swatch: "bg-sage", cell: "bg-sage/40" },
  { id: "warn", label: "Ámbar", swatch: "bg-warn", cell: "bg-warn/40" },
  { id: "danger", label: "Rojo", swatch: "bg-danger", cell: "bg-danger/35" },
  { id: "info", label: "Azul", swatch: "bg-info", cell: "bg-info/40" },
];

export function defaultTint(rowId: string): LedgerTint {
  if (rowId === "fac_x" || rowId === "fac_a" || rowId === "cigarrillos" || rowId === "total_proveedores") {
    return "warn";
  }
  if (rowId === "retiros" || (GASTO_IDS as readonly string[]).includes(rowId)) return "danger";
  if (rowId === "pagos_virtuales") return "info";
  return "sage";
}

export function tintOf(rowId: string, tints?: Record<string, LedgerTint>): LedgerTint {
  return tints?.[rowId] ?? defaultTint(rowId);
}

function n(cells: Record<string, number>, id: string): number {
  return Number(cells[id] ?? 0) || 0;
}

export function emptyBook(date: string): DayBook {
  return {
    date,
    safeCount: 0,
    virtualCel: 0,
    virtualSube: 0,
    facA: 0,
    facX: 0,
    cigarrillos: 0,
    expenses: [],
    notes: "",
    cells: {},
  };
}

export function cellsOf(book: DayBook | undefined): Record<string, number> {
  if (!book) return {};
  const c = { ...(book.cells ?? {}) };
  if (c.fac_a == null && book.facA) c.fac_a = book.facA;
  if (c.fac_x == null && book.facX) c.fac_x = book.facX;
  if (c.cigarrillos == null && book.cigarrillos) c.cigarrillos = book.cigarrillos;
  if (c.ventas_virtuales == null && book.virtualCel) c.ventas_virtuales = book.virtualCel;
  if (c.caja == null && book.safeCount) c.caja = book.safeCount;
  return c;
}

export function cellValue(
  rows: DayBook[],
  date: string,
  id: string,
): number {
  const book = rows.find((b) => b.date === date);
  const cells = cellsOf(book);
  if (id === "saldo_inicial") {
    const prev = prevDate(date);
    const p = cellsOf(rows.find((b) => b.date === prev));
    return n(p, "caja");
  }
  if (id === "total_proveedores") {
    return n(cells, "fac_x") + n(cells, "fac_a") + n(cells, "cigarrillos");
  }
  if (id === "total_ventas") {
    const proveedores = n(cells, "fac_x") + n(cells, "fac_a") + n(cells, "cigarrillos");
    const gastos = GASTO_IDS.reduce((a, k) => a + n(cells, k), 0);
    const saldo = cellValue(rows, date, "saldo_inicial");
    return (
      n(cells, "caja") -
      saldo +
      proveedores +
      gastos +
      n(cells, "retiros") +
      n(cells, "pagos_virtuales") -
      n(cells, "ventas_virtuales")
    );
  }
  return n(cells, id);
}

function prevDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

export function monthDates(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(y!, m!, 0).getDate();
  return Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
}

export function formatDayTitle(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Day number + weekday, no year — the month title already has it. */
export function formatDayHead(iso: string): { n: string; wd: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const wd = dt
    .toLocaleDateString("es-AR", { weekday: "short" })
    .replace(".", "")
    .replace(/^\w/, (c) => c.toLowerCase());
  return { n: String(d ?? ""), wd };
}

export type MonthCc = {
  facX: number;
  facA: number;
  cigarrillos: number;
  proveedores: number;
  totalVentas: number;
  ingresoMp: number;
  ingresoCaja: number;
  gastos: number;
  ganancias: number;
};

export function monthCc(books: DayBook[], ym: string): MonthCc {
  const dates = monthDates(ym);
  let facX = 0;
  let facA = 0;
  let cigarrillos = 0;
  let totalVentas = 0;
  let ingresoMp = 0;
  let gastos = 0;
  for (const date of dates) {
    facX += cellValue(books, date, "fac_x");
    facA += cellValue(books, date, "fac_a");
    cigarrillos += cellValue(books, date, "cigarrillos");
    totalVentas += cellValue(books, date, "total_ventas");
    ingresoMp += cellValue(books, date, "ventas_virtuales");
    for (const id of GASTO_IDS) gastos += cellValue(books, date, id);
  }
  const proveedores = facX + facA + cigarrillos;
  const ingresoCaja = totalVentas - ingresoMp;
  const ganancias = ingresoCaja + ingresoMp - gastos - proveedores;
  return { facX, facA, cigarrillos, proveedores, totalVentas, ingresoMp, ingresoCaja, gastos, ganancias };
}

export function currentYm(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthTitle(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

export function quarterOf(ym: string): 1 | 2 | 3 | 4 {
  const m = Number(ym.slice(5, 7));
  return Math.ceil(m / 3) as 1 | 2 | 3 | 4;
}

export function monthsOfQuarter(year: number, q: 1 | 2 | 3 | 4): string[] {
  const start = (q - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(start + i).padStart(2, "0")}`);
}

export function monthsOfYear(year: number): string[] {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => `${year}-${String(m).padStart(2, "0")}`);
}

export function sheetToBooks(sheet: MonthSheet): DayBook[] {
  return sheet.days.map((d) => ({
    ...emptyBook(d.date),
    cells: { ...d.cells },
    facA: d.cells.fac_a ?? 0,
    facX: d.cells.fac_x ?? 0,
    cigarrillos: d.cells.cigarrillos ?? 0,
    virtualCel: d.cells.ventas_virtuales ?? 0,
    safeCount: d.cells.caja ?? 0,
  }));
}

export function booksForYm(books: DayBook[], sheets: MonthSheet[], ym: string): DayBook[] {
  const live = books.filter((b) => b.date.startsWith(ym));
  if (live.length) {
    const carry = books.filter((b) => !b.date.startsWith(ym));
    return [...live, ...carry];
  }
  const sheet = sheets.find((s) => s.ym === ym);
  return sheet ? sheetToBooks(sheet) : [];
}

export function archiveClosedMonths(
  books: DayBook[],
  sheets: MonthSheet[],
  labels: Record<string, string> | undefined,
  now = new Date(),
): { books: DayBook[]; monthSheets: MonthSheet[] } {
  const cur = currentYm(now);
  const firstOfCur = `${cur}-01`;
  const carry = prevDate(firstOfCur);
  const have = new Set(sheets.map((s) => s.ym));
  const nextSheets = [...sheets];
  const byYm = new Map<string, DayBook[]>();
  for (const b of books) {
    const ym = b.date.slice(0, 7);
    const arr = byYm.get(ym) ?? [];
    arr.push(b);
    byYm.set(ym, arr);
  }
  for (const [ym, rows] of byYm) {
    if (ym >= cur || have.has(ym)) continue;
    nextSheets.push({
      ym,
      archivedAt: now.toISOString(),
      labels: labels ?? {},
      days: rows.map((r) => ({ date: r.date, cells: cellsOf(r) })),
    });
    have.add(ym);
  }
  return {
    books: books.filter((b) => b.date.startsWith(cur) || b.date === carry),
    monthSheets: nextSheets.sort((a, b) => b.ym.localeCompare(a.ym)).slice(0, 12),
  };
}

export function ledgerCsv(
  ym: string,
  books: DayBook[],
  labels?: Record<string, string>,
): string {
  const dates = monthDates(ym);
  const header = ["Dato", ...dates.map(formatDayTitle)].join(",");
  const lines = LEDGER_ROWS.filter((r) => r.kind !== "spacer").map((row) => {
    const name = (rowTitle(row, labels) || row.id).replace(/,/g, " ");
    const vals = dates.map((d) => {
      const v = cellValue(books, d, row.id);
      return v ? String(v) : "";
    });
    return [name, ...vals].join(",");
  });
  return [header, ...lines].join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
