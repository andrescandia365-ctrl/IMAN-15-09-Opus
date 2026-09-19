import * as XLSX from "xlsx";
import type { Category, Product } from "./types";
import { uid } from "./utils.ts";

export type CatalogPreviewRow = {
  name: string;
  barcode: string;
  price: number;
  cost: number | null;
  stock: number;
  category: string;
};

export type NumberFormat = "us" | "latam";

export type CatalogRawRow = {
  name: string;
  barcode: string;
  category: string;
  priceRaw: string;
  costRaw: string;
  stockRaw: string;
};

export type CatalogDraft = {
  missing: string[];
  samples: string[];
  rows: CatalogRawRow[];
};

export type CatalogParseResult = CatalogDraft;

const HEAD = [
  "codigo",
  "nombre",
  "categoria",
  "precio_vta",
  "costo_unidad",
  "stock",
  "valor_stock",
] as const;

function fold(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickCol(heads: string[], kind: "code" | "name" | "category" | "price" | "cost" | "stock"): number {
  const h = heads.map(fold);
  const tests: Record<typeof kind, ((s: string) => boolean)[]> = {
    code: [(s) => /^(codigo|cod|ean|barcode|barra)$/.test(s), (s) => /^(codigo|ean|barcode)/.test(s) && !/pack|bulto/.test(s)],
    name: [(s) => /^(nombre|name|producto)$/.test(s), (s) => s.includes("nombre")],
    category: [(s) => /^(categoria|rubro|category)$/.test(s), (s) => /categ|rubro/.test(s)],
    price: [
      (s) => /precio vta|p venta|precio venta/.test(s),
      (s) => /^(precio|price|venta)$/.test(s),
      (s) => s.includes("precio") && !/costo|compra/.test(s),
    ],
    cost: [(s) => /costo (por )?unidad|costo unidad/.test(s), (s) => /^(costo|cost|compra)$/.test(s), (s) => s.includes("costo")],
    stock: [(s) => /stock en existencia|existencia/.test(s), (s) => /^(stock|unidades)$/.test(s), (s) => s.includes("stock")],
  };
  for (const test of tests[kind]) {
    const i = h.findIndex(test);
    if (i >= 0) return i;
  }
  return -1;
}

function cellStr(c: unknown): string {
  if (c == null || c === "") return "";
  if (typeof c === "number" && Number.isFinite(c)) return String(c);
  return String(c).trim();
}

/** Yanqui 1,234.56 · Latino 1.234,56 */
export function parseLocaleNumber(raw: string, format: NumberFormat): number | null {
  let t = String(raw).trim().replace(/[$€£\s]/g, "");
  if (!t || t === "-" || t === "—" || t === ".") return null;
  if (format === "us") t = t.replace(/,/g, "");
  else t = t.replace(/\./g, "").replace(",", ".");
  t = t.replace(/[^\d.-]/g, "");
  if (!t || t === "-" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function detectNumberFormat(samples: string[]): {
  format: NumberFormat | null;
  confident: boolean;
  example: string;
} {
  let us = 0;
  let latam = 0;
  let example = "";
  for (const raw of samples) {
    const t = String(raw).trim().replace(/[$€£\s]/g, "");
    if (!t) continue;
    const usThousands = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t);
    const latamThousands = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t);
    const latamDecimal = /^\d+,\d{1,2}$/.test(t);
    const usDecimal = /^\d+\.\d{1,2}$/.test(t);
    if (usThousands || (usDecimal && !latamThousands)) {
      us += 1;
      if (!example) example = String(raw).trim();
    }
    if (latamThousands || (latamDecimal && !usThousands)) {
      latam += 1;
      if (!example) example = String(raw).trim();
    }
  }
  if (!example) {
    const first = samples.map((s) => s.trim()).find(Boolean);
    example = first || "7,500.00";
  }
  if (us > latam && us > 0) return { format: "us", confident: latam === 0 || us >= latam * 2, example };
  if (latam > us && latam > 0) return { format: "latam", confident: us === 0 || latam >= us * 2, example };
  const same = samples.every((s) => {
    const a = parseLocaleNumber(s, "us");
    const b = parseLocaleNumber(s, "latam");
    return a === b;
  });
  if (same && samples.some((s) => s.trim())) return { format: "latam", confident: true, example };
  return { format: null, confident: false, example };
}

export function materializeCatalog(draft: CatalogDraft, format: NumberFormat): CatalogPreviewRow[] {
  return draft.rows.map((r) => {
    const costRaw = r.costRaw.trim();
    const stockRaw = r.stockRaw.trim();
    return {
      name: r.name,
      barcode: r.barcode,
      category: r.category,
      price: parseLocaleNumber(r.priceRaw, format) ?? 0,
      cost: costRaw ? parseLocaleNumber(costRaw, format) : null,
      stock: stockRaw ? (parseLocaleNumber(stockRaw, format) ?? 0) : 0,
    };
  });
}

export function parseCatalogGrid(heads: string[], body: string[][]): CatalogDraft {
  const iName = pickCol(heads, "name");
  const iBar = pickCol(heads, "code");
  const iPrice = pickCol(heads, "price");
  const iCost = pickCol(heads, "cost");
  const iStock = pickCol(heads, "stock");
  const iCat = pickCol(heads, "category");
  const labels: [number, string][] = [
    [iName, "NOMBRE"],
    [iBar, "CODIGO"],
    [iCat, "Categoria"],
    [iPrice, "PRECIO VTA"],
    [iCost, "Costo por unidad"],
    [iStock, "stock en existencia"],
  ];
  const missing = labels.filter(([i]) => i < 0).map(([, n]) => n);
  const rows: CatalogRawRow[] = [];
  const samples: string[] = [];
  if (iName < 0) return { rows, missing, samples };
  for (const cols of body) {
    const name = cellStr(cols[iName]);
    if (!name) continue;
    const priceRaw = iPrice >= 0 ? cellStr(cols[iPrice]) : "";
    const costRaw = iCost >= 0 ? cellStr(cols[iCost]) : "";
    const stockRaw = iStock >= 0 ? cellStr(cols[iStock]) : "";
    if (priceRaw) samples.push(priceRaw);
    if (costRaw) samples.push(costRaw);
    if (stockRaw) samples.push(stockRaw);
    rows.push({
      name,
      barcode: iBar >= 0 ? cellStr(cols[iBar]) : "",
      category: (iCat >= 0 ? cellStr(cols[iCat]) : "") || "Kiosco",
      priceRaw,
      costRaw,
      stockRaw,
    });
  }
  return { rows, missing, samples };
}

export function parseCatalogText(raw: string): CatalogParseResult {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], missing: ["NOMBRE"], samples: [] };
  const sep = lines[0]!.includes(";") && !lines[0]!.includes(",") ? ";" : ",";
  const head = splitCsv(lines[0]!, sep);
  const body = lines.slice(1).map((l) => splitCsv(l, sep));
  return parseCatalogGrid(head, body);
}

export async function parseCatalogFile(file: File): Promise<CatalogParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
    if (!sheet) return { rows: [], missing: ["NOMBRE"], samples: [] };
    const aoa = XLSX.utils.sheet_to_json<(string | number | boolean | null | undefined)[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    if (aoa.length < 2) return { rows: [], missing: ["NOMBRE"], samples: [] };
    const head = (aoa[0] ?? []).map((c) => cellStr(c));
    const body = aoa.slice(1).map((row) => (row ?? []).map((c) => cellStr(c)));
    return parseCatalogGrid(head, body);
  }
  const text = await file.text();
  return parseCatalogText(text);
}

function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === sep && !q) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function sameCatalog(a: Product, b: Product): boolean {
  return (
    a.name === b.name &&
    a.barcode === b.barcode &&
    a.price === b.price &&
    a.cost === b.cost &&
    a.categoryId === b.categoryId
  );
}

/**
 * Aplica la planilla sobre una copia. Producto que ya existe: nombre, código,
 * precio, costo y rubro. El stock de la fila se ignora (queda el del local, con
 * sus lotes). Alta: stock de la planilla, sin lotes.
 */
export function applyCatalogPreview(
  rows: CatalogPreviewRow[],
  products: Product[],
  categories: Category[],
): { products: Product[]; categories: Category[] } {
  const cats = [...categories];
  const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
  const nextProducts = products.map((p) => ({ ...p }));
  for (const r of rows) {
    let cat = byName.get(r.category.toLowerCase());
    if (!cat) {
      cat = { id: uid("c"), name: r.category, sort: cats.length + 1 };
      cats.push(cat);
      byName.set(r.category.toLowerCase(), cat);
    }
    const hit = nextProducts.find(
      (p) => (r.barcode && p.barcode === r.barcode) || p.name.toLowerCase() === r.name.toLowerCase(),
    );
    if (hit) {
      const barcode = r.barcode || hit.barcode;
      const cost = r.cost != null ? r.cost : hit.cost;
      const changed =
        hit.name !== r.name ||
        hit.barcode !== barcode ||
        hit.price !== r.price ||
        hit.cost !== cost ||
        hit.categoryId !== cat.id;
      hit.name = r.name;
      hit.barcode = barcode;
      hit.price = r.price;
      hit.cost = cost;
      hit.categoryId = cat.id;
      if (changed) hit.priceUpdatedAt = new Date().toISOString();
      // Stock y lotes no se tocan: la góndola manda, no la planilla.
    } else {
      nextProducts.push({
        id: uid("p"),
        name: r.name,
        barcode: r.barcode,
        price: r.price,
        cost: r.cost,
        stock: r.stock,
        stockMin: 4,
        categoryId: cat.id,
        active: true,
        expiresAt: null,
        priceUpdatedAt: new Date().toISOString(),
      });
    }
  }
  return { products: nextProducts, categories: cats };
}

/** Lo que hay que guardar con eventos: rubros nuevos y productos dados de alta o con catálogo distinto. */
export function catalogImportTouched(
  before: { products: Product[]; categories: Category[] },
  after: { products: Product[]; categories: Category[] },
): { newCategories: Category[]; upserts: Product[] } {
  const hadCat = new Set(before.categories.map((c) => c.id));
  const beforeById = new Map(before.products.map((p) => [p.id, p]));
  return {
    newCategories: after.categories.filter((c) => !hadCat.has(c.id)),
    upserts: after.products.filter((p) => {
      const cur = beforeById.get(p.id);
      return !cur || !sameCatalog(cur, p);
    }),
  };
}

export function catalogExportRows(products: Product[], categories: Category[]): (string | number)[][] {
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
  const head = [...HEAD];
  const lines = products.map((p) => {
    const cost = p.cost ?? 0;
    const valor = p.stock * cost;
    return [p.barcode, p.name, catName(p.categoryId), p.price, p.cost ?? "", p.stock, valor];
  });
  return [head, ...lines];
}

function csvCell(s: string | number): string {
  const t = String(s);
  if (/[",\n;]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

export function exportCatalogCsv(products: Product[], categories: Category[]): string {
  return catalogExportRows(products, categories)
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

export function downloadCatalogCsv(products: Product[], categories: Category[], store: string) {
  const csv = exportCatalogCsv(products, categories);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `${fileBase(store)}-catalogo.csv`);
}

export function downloadCatalogXlsx(products: Product[], categories: Category[], store: string) {
  const aoa = catalogExportRows(products, categories);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Catalogo");
  XLSX.writeFile(wb, `${fileBase(store)}-catalogo.xlsx`);
}

function fileBase(store: string) {
  return store.replace(/\s+/g, "-") || "iman";
}

function triggerDownload(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** @deprecated use downloadCatalogCsv */
export function downloadCatalog(products: Product[], categories: Category[], store: string) {
  downloadCatalogCsv(products, categories, store);
}
