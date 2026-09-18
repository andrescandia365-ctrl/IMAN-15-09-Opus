import type { Category, Product, Settings, Supplier } from "@/lib/types";

export type InvoiceKind = "A" | "X";

function norm(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Canonical keys after alias. */
const DEFAULT_A: Record<string, number> = {
  bebidas: 1.8,
  papas: 1.85,
  sandwiches: 2.12,
  mercaderia: 2.12,
  tabacos: 1.75,
  helados: 1.5,
  golosinas: 2.12,
  lacteos: 1.7,
  speed: 1.55,
};

const DEFAULT_X: Record<string, number> = {
  bebidas: 1.5,
  papas: 1.5,
  sandwiches: 1.85,
  mercaderia: 1.85,
  tabacos: 1.5,
  helados: 1.85,
  golosinas: 1.85,
  lacteos: 1.7,
  speed: 1.55,
};

const ALIAS: Record<string, string> = {
  cigarrillos: "tabacos",
  cigarrillo: "tabacos",
  tabaco: "tabacos",
  almacen: "mercaderia",
  almacenes: "mercaderia",
  sandwich: "sandwiches",
  lacteo: "lacteos",
};

function canon(name: string): string {
  const n = norm(name);
  return ALIAS[n] ?? n;
}

export function defaultFactor(categoryName: string, kind: InvoiceKind): number | null {
  const key = canon(categoryName);
  const table = kind === "A" ? DEFAULT_A : DEFAULT_X;
  return table[key] ?? null;
}

export function factorFor(category: Category, kind: InvoiceKind, settings: Settings): number {
  const map = kind === "A" ? settings.priceMarkupsA : settings.priceMarkups;
  const stored = map?.[category.id];
  if (typeof stored === "number" && stored > 0) return stored;
  return defaultFactor(category.name, kind) ?? 1;
}

/** Sin margen propio ni uno conocido, factorFor da 1: se vendería al costo. */
export function hasFactor(category: Category, kind: InvoiceKind, settings: Settings): boolean {
  const map = kind === "A" ? settings.priceMarkupsA : settings.priceMarkups;
  const stored = map?.[category.id];
  if (typeof stored === "number" && stored > 0) return true;
  return defaultFactor(category.name, kind) != null;
}

/** Un dedazo en el costo se ve en el precio: más de 40% arriba o abajo se pregunta. */
export function isBigPriceJump(before: number, after: number): boolean {
  if (!(before > 0)) return false;
  return Math.abs(after - before) / before > 0.4;
}

export function unitCost(p: Product): number | null {
  if (p.cost == null || !(p.cost > 0)) return null;
  return p.cost;
}

export function roundPrice(raw: number, step: number, mode: "up" | "down"): number {
  const s = step > 0 ? step : 100;
  const n = mode === "down" ? Math.floor(raw / s) * s : Math.ceil(raw / s) * s;
  return Math.max(0, n);
}

export function quotedPrice(
  p: Product,
  factor: number,
  step: number,
  mode: "up" | "down",
): number | null {
  const c = unitCost(p);
  if (c == null) return null;
  return roundPrice(c * factor, step, mode);
}

export function productsForCross(
  products: Product[],
  categoryId: string,
  supplier: Supplier,
): Product[] {
  const ids = supplier.categoryIds ?? [];
  if (ids.length && !ids.includes(categoryId)) return [];
  return products
    .filter((p) => p.active && p.categoryId === categoryId)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function invoiceOf(s: Supplier): InvoiceKind | null {
  return s.invoiceType === "A" || s.invoiceType === "X" ? s.invoiceType : null;
}

/** Fac A/X is always the supplier's. A loose product uses the one that brings its rubro. */
export function invoiceForProduct(
  p: Product,
  suppliers: Supplier[],
): { supplier: Supplier; invoice: InvoiceKind } | null {
  const hits = suppliers.filter((s) => {
    if (!invoiceOf(s)) return false;
    const ids = s.categoryIds ?? [];
    if (!ids.length) return true;
    return ids.includes(p.categoryId);
  });
  const s = hits[0];
  if (!s) return null;
  const invoice = invoiceOf(s);
  if (!invoice) return null;
  return { supplier: s, invoice };
}

/** La Fac que va a góndola: la del proveedor que trae el rubro; si nadie con factura lo trae, la X. */
export function shelfInvoice(p: Product, suppliers: Supplier[]): InvoiceKind {
  return invoiceForProduct(p, suppliers)?.invoice ?? "X";
}
