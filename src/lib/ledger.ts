import type { DayBook, LedgerKind, LedgerRow, LedgerTagDef, MonthSheet, Settings } from "./types.ts";
import { LEDGER_TAG_IDS } from "./types.ts";
import { todayKey } from "./format.ts";

export type { LedgerKind, LedgerRow, LedgerTagDef };
export { LEDGER_TAG_IDS };

export const LOCKED_LEDGER = new Set(["saldo_inicial", "total_proveedores", "total_ventas"]);
/** Sin esta fila no se cuadra el efectivo. El dueño no la oculta. */
export const CAJA_LEDGER = new Set(["caja"]);

export const LEDGER_TAG_LABEL: Record<(typeof LEDGER_TAG_IDS)[number], string> = {
  gasto: "Gasto",
  empleado: "Empleado",
  alquiler: "Alquiler",
  contador: "Contador",
  arca: "ARCA",
  iibb: "IIBB",
  expensas: "Expensas",
  fumigacion: "Fumigación",
  retiro: "Retiro",
  proveedor: "Proveedor",
  venta: "Venta",
  otro: "Otro",
};

/** Lo que no es plata de caja: entra en Gastos de El mes. */
export const MES_GASTO_TAGS = new Set([
  "gasto",
  "alquiler",
  "contador",
  "arca",
  "iibb",
  "expensas",
  "fumigacion",
  "empleado",
]);

export function rowTitle(row: LedgerRow, labels?: Record<string, string>): string {
  const custom = labels?.[row.id]?.trim();
  if (custom) return custom;
  return row.label;
}

export function tagLabel(tag: string | undefined, extra?: LedgerTagDef[]): string {
  if (!tag) return "";
  const known = (LEDGER_TAG_IDS as readonly string[]).includes(tag)
    ? LEDGER_TAG_LABEL[tag as (typeof LEDGER_TAG_IDS)[number]]
    : undefined;
  if (known) return known;
  const custom = extra?.find((t) => t.id === tag)?.label?.trim();
  return custom || tag;
}

/** Caja to square + empty named gastos. Not Aylen's people. */
export const DEFAULT_LEDGER_ROWS: LedgerRow[] = [
  { id: "saldo_inicial", label: "SALDO INICIAL", kind: "formula" },
  { id: "fac_x", label: "FAC X", kind: "input", tag: "proveedor" },
  { id: "fac_a", label: "FAC A", kind: "input", tag: "proveedor" },
  { id: "cigarrillos", label: "CIGARRILLOS", kind: "input", tag: "proveedor" },
  { id: "caja", label: "CAJA", kind: "input", tag: "venta" },
  { id: "ventas_virtuales", label: "VENTAS VIRTUALES", kind: "input", tag: "venta" },
  { id: "pagos_virtuales", label: "PAGOS VIRTUALES", kind: "input", tag: "venta" },
  { id: "total_proveedores", label: "TOTAL PROVEEDORES", kind: "formula" },
  { id: "total_ventas", label: "TOTAL VENTAS", kind: "formula" },
  { id: "retiros", label: "RETIROS", kind: "input", tag: "retiro" },
  { id: "sp1", label: "", kind: "spacer" },
  { id: "gasto_1", label: "", kind: "input", tag: "gasto" },
  { id: "gasto_2", label: "", kind: "input", tag: "gasto" },
  { id: "gasto_3", label: "", kind: "input", tag: "gasto" },
  { id: "gasto_4", label: "", kind: "input", tag: "gasto" },
  { id: "gasto_5", label: "", kind: "input", tag: "gasto" },
  { id: "gasto_6", label: "", kind: "input", tag: "gasto" },
  { id: "gasto_7", label: "", kind: "input", tag: "gasto" },
  { id: "gasto_8", label: "", kind: "input", tag: "gasto" },
];

export const LEDGER_ROWS = DEFAULT_LEDGER_ROWS;

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

export function cloneLedgerRows(rows: LedgerRow[]): LedgerRow[] {
  return rows.map((r) => ({ ...r }));
}

function applyLabels(rows: LedgerRow[], labels?: Record<string, string>): LedgerRow[] {
  if (!labels) return cloneLedgerRows(rows);
  return rows.map((r) => {
    const name = labels[r.id]?.trim();
    return name ? { ...r, label: name } : { ...r };
  });
}

function ensureFixed(rows: LedgerRow[]): LedgerRow[] {
  const have = new Set(rows.map((r) => r.id));
  const missing = DEFAULT_LEDGER_ROWS.filter(
    (d) => (LOCKED_LEDGER.has(d.id) || CAJA_LEDGER.has(d.id)) && !have.has(d.id),
  );
  return missing.length ? [...missing.map((r) => ({ ...r })), ...rows] : rows;
}

export function normalizeLedgerRows(raw: unknown, labels?: Record<string, string>): LedgerRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows: LedgerRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as LedgerRow;
    if (!r.id || typeof r.id !== "string") continue;
    const kind: LedgerKind = r.kind === "formula" || r.kind === "spacer" ? r.kind : "input";
    const label = labels?.[r.id]?.trim() || (typeof r.label === "string" ? r.label : "");
    const row: LedgerRow = { id: r.id, label, kind };
    if (kind === "input") row.tag = typeof r.tag === "string" && r.tag.trim() ? r.tag.trim() : "otro";
    if (r.hidden) row.hidden = true;
    rows.push(row);
  }
  return rows.length ? ensureFixed(rows) : null;
}

export function visibleLedgerRows(rows: LedgerRow[]): LedgerRow[] {
  return rows.filter((r) => r.kind === "spacer" || !r.hidden);
}

export function slugLedger(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return s || "fila";
}

function uniqueRowId(base: string, rows: LedgerRow[]): string {
  if (!rows.some((r) => r.id === base)) return base;
  let i = 2;
  while (rows.some((r) => r.id === `${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

function tagForExpenseName(name: string): string {
  const s = slugLedger(name);
  const map: Record<string, string> = {
    alquiler: "alquiler",
    expensas: "expensas",
    contador: "contador",
    sueldos: "empleado",
    sueldo: "empleado",
    empleado: "empleado",
    arca: "arca",
    iibb: "iibb",
    ingresos_brutos: "iibb",
    fumigacion: "fumigacion",
    luz: "gasto",
    gas: "gasto",
  };
  return map[s] ?? "gasto";
}

export type LedgerSettingsBit = {
  ledgerRows?: LedgerRow[];
  ledgerLabels?: Record<string, string>;
  ledgerTags?: LedgerTagDef[];
  monthExpenses?: { name: string; amount: number }[];
};

export type LedgerAdopt = {
  rows: LedgerRow[];
  tags: LedgerTagDef[];
  deposits: { rowId: string; amount: number }[];
  adoptedExpenses: boolean;
};

function normalizeTags(raw: unknown): LedgerTagDef[] {
  if (!Array.isArray(raw)) return [];
  const out: LedgerTagDef[] = [];
  const seen = new Set<string>(LEDGER_TAG_IDS);
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as LedgerTagDef;
    const id = typeof t.id === "string" ? slugLedger(t.id) : "";
    const label = typeof t.label === "string" ? t.label.trim() : "";
    if (!id || seen.has(id) || !label) continue;
    seen.add(id);
    out.push({ id, label });
  }
  return out;
}

/**
 * Arma las filas de ahora. Si venían gastos fijos en settings.monthExpenses,
 * los pasa a filas (una vez) y deja los montos para depositar en el día 1.
 */
export function takeMonthExpenses(s: LedgerSettingsBit): LedgerAdopt {
  const labels = s.ledgerLabels ?? {};
  let rows =
    normalizeLedgerRows(s.ledgerRows, labels) ?? applyLabels(cloneLedgerRows(DEFAULT_LEDGER_ROWS), labels);
  const tags = normalizeTags(s.ledgerTags);
  const deposits: { rowId: string; amount: number }[] = [];
  const expenses = Array.isArray(s.monthExpenses) ? s.monthExpenses : [];
  for (const e of expenses) {
    const name = (e?.name ?? "").trim();
    if (!name) continue;
    const needle = name.toLowerCase();
    const slug = slugLedger(name);
    let row = rows.find(
      (r) => r.kind === "input" && (r.label.trim().toLowerCase() === needle || r.id === slug),
    );
    if (!row) {
      const id = uniqueRowId(slug, rows);
      row = { id, label: name, kind: "input", tag: tagForExpenseName(name) };
      rows = [...rows, row];
    } else if (!row.label.trim()) {
      const id = row.id;
      const tag = row.tag || tagForExpenseName(name);
      rows = rows.map((r) => (r.id === id ? { ...r, label: name, tag, hidden: false } : r));
      row = rows.find((r) => r.id === id)!;
    }
    if (e.amount > 0) deposits.push({ rowId: row.id, amount: e.amount });
  }
  return { rows, tags, deposits, adoptedExpenses: expenses.length > 0 };
}

export function resolveLedgerRows(s?: LedgerSettingsBit): LedgerRow[] {
  return takeMonthExpenses(s ?? {}).rows;
}

export function adoptLedgerSettings(s: Settings): Settings {
  const taken = takeMonthExpenses(s);
  const hadRows = Array.isArray(s.ledgerRows) && s.ledgerRows.length > 0;
  if (!taken.adoptedExpenses && !hadRows) return s;
  return {
    ...s,
    ledgerRows: taken.rows,
    ledgerTags: taken.tags.length ? taken.tags : s.ledgerTags ?? [],
    monthExpenses: [],
  };
}

export function depositLedgerAmounts(
  books: DayBook[],
  deposits: { rowId: string; amount: number }[],
  ym = currentYm(),
): DayBook[] {
  if (!deposits.length) return books;
  const date = `${ym}-01`;
  let next = books;
  for (const d of deposits) {
    if (!(d.amount > 0)) continue;
    const cur = next.find((b) => b.date === date) ?? emptyBook(date);
    const cells = cellsOf(cur);
    if ((cells[d.rowId] ?? 0) !== 0) continue;
    next = upsertBook(next, { ...cur, date, cells: { ...cells, [d.rowId]: d.amount } });
  }
  return next;
}

function upsertBook(books: DayBook[], row: DayBook): DayBook[] {
  const i = books.findIndex((b) => b.date === row.date);
  if (i < 0) return [row, ...books];
  const copy = books.slice();
  copy[i] = { ...books[i]!, ...row };
  return copy;
}

export function ledgerRowsForYm(
  ym: string,
  settings: LedgerSettingsBit,
  sheets: MonthSheet[],
  now?: Date,
): LedgerRow[] {
  if (ym < currentYm(now)) {
    const sheet = sheets.find((s) => s.ym === ym);
    if (sheet?.rows && sheet.rows.length) return cloneLedgerRows(sheet.rows);
    if (sheet) return applyLabels(cloneLedgerRows(DEFAULT_LEDGER_ROWS), sheet.labels);
  }
  return resolveLedgerRows(settings);
}

export function defaultTint(rowId: string, tag?: string): LedgerTint {
  const t = tag ?? "";
  if (t === "proveedor" || rowId === "total_proveedores") return "warn";
  if (t === "retiro" || MES_GASTO_TAGS.has(t)) return "danger";
  if (rowId === "pagos_virtuales") return "info";
  return "sage";
}

export function tintOf(
  rowId: string,
  tints?: Record<string, LedgerTint>,
  tag?: string,
): LedgerTint {
  return tints?.[rowId] ?? defaultTint(rowId, tag);
}

function n(cells: Record<string, number>, id: string): number {
  return Number(cells[id] ?? 0) || 0;
}

function sumTagged(cells: Record<string, number>, rows: LedgerRow[], tag: string | Set<string>): number {
  let t = 0;
  for (const r of rows) {
    if (r.kind !== "input") continue;
    const ok = typeof tag === "string" ? r.tag === tag : tag.has(r.tag ?? "");
    if (ok) t += n(cells, r.id);
  }
  return t;
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

/** Si la celda ya dice eso. Una celda vacía vale 0, igual que en pantalla. */
export function sameCell(books: DayBook[], date: string, rowId: string, value: number): boolean {
  return (cellsOf(books.find((b) => b.date === date))[rowId] ?? 0) === value;
}

export function cellValue(
  rows: DayBook[],
  date: string,
  id: string,
  ledgerRows: LedgerRow[] = DEFAULT_LEDGER_ROWS,
): number {
  const book = rows.find((b) => b.date === date);
  const cells = cellsOf(book);
  if (id === "saldo_inicial") {
    const prev = prevDate(date);
    const p = cellsOf(rows.find((b) => b.date === prev));
    return n(p, "caja");
  }
  if (id === "total_proveedores") {
    return sumTagged(cells, ledgerRows, "proveedor");
  }
  if (id === "total_ventas") {
    const proveedores = sumTagged(cells, ledgerRows, "proveedor");
    const gastos = sumTagged(cells, ledgerRows, "gasto");
    const retiros = sumTagged(cells, ledgerRows, "retiro");
    const saldo = cellValue(rows, date, "saldo_inicial", ledgerRows);
    return (
      n(cells, "caja") -
      saldo +
      proveedores +
      gastos +
      retiros +
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
  proveedorRows: { id: string; label: string; amount: number }[];
  totalVentas: number;
  ingresoMp: number;
  ingresoCaja: number;
  gastos: number;
  retiros: number;
  ganancias: number;
};

export function monthCc(
  books: DayBook[],
  ym: string,
  ledgerRows: LedgerRow[] = DEFAULT_LEDGER_ROWS,
): MonthCc {
  const dates = monthDates(ym);
  let facX = 0;
  let facA = 0;
  let cigarrillos = 0;
  let totalVentas = 0;
  let ingresoMp = 0;
  let gastos = 0;
  let proveedores = 0;
  let retiros = 0;
  const proveedorRows = ledgerRows
    .filter((r) => r.kind === "input" && r.tag === "proveedor")
    .map((r) => ({ id: r.id, label: rowTitle(r) || r.id, amount: 0 }));
  for (const date of dates) {
    const cells = cellsOf(books.find((b) => b.date === date));
    facX += n(cells, "fac_x");
    facA += n(cells, "fac_a");
    cigarrillos += n(cells, "cigarrillos");
    totalVentas += cellValue(books, date, "total_ventas", ledgerRows);
    ingresoMp += cellValue(books, date, "ventas_virtuales", ledgerRows);
    gastos += sumTagged(cells, ledgerRows, MES_GASTO_TAGS);
    proveedores += sumTagged(cells, ledgerRows, "proveedor");
    retiros += sumTagged(cells, ledgerRows, "retiro");
    for (const line of proveedorRows) line.amount += n(cells, line.id);
  }
  const ingresoCaja = totalVentas - ingresoMp;
  const ganancias = ingresoCaja + ingresoMp - gastos - proveedores;
  return {
    facX,
    facA,
    cigarrillos,
    proveedores,
    proveedorRows,
    totalVentas,
    ingresoMp,
    ingresoCaja,
    gastos,
    retiros,
    ganancias,
  };
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
  rows: LedgerRow[] | Record<string, string> | undefined,
  now = new Date(),
): { books: DayBook[]; monthSheets: MonthSheet[] } {
  const ledgerRows = Array.isArray(rows)
    ? cloneLedgerRows(rows)
    : applyLabels(cloneLedgerRows(DEFAULT_LEDGER_ROWS), rows);
  const labels: Record<string, string> = {};
  for (const r of ledgerRows) {
    if (r.label) labels[r.id] = r.label;
  }
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
  for (const [ym, monthBooks] of byYm) {
    if (ym >= cur || have.has(ym)) continue;
    nextSheets.push({
      ym,
      archivedAt: now.toISOString(),
      labels,
      rows: cloneLedgerRows(ledgerRows),
      days: monthBooks.map((r) => ({ date: r.date, cells: cellsOf(r) })),
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
  rows: LedgerRow[] = DEFAULT_LEDGER_ROWS,
  labels?: Record<string, string>,
): string {
  const dates = monthDates(ym);
  const header = ["Dato", ...dates.map(formatDayTitle)].join(",");
  const lines = rows
    .filter((r) => r.kind !== "spacer")
    .map((row) => {
      const name = (rowTitle(row, labels) || row.id).replace(/,/g, " ");
      const vals = dates.map((d) => {
        const v = cellValue(books, d, row.id, rows);
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
