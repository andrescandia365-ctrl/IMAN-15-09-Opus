import type { OrderLine, Product } from "@/lib/types";

export function packOf(p: { packQty?: number | null } | undefined): number {
  const n = p?.packQty ?? 1;
  return n > 1 ? n : 1;
}

export function lineUnits(p: Product | undefined, qty: number, asUnit?: boolean): number {
  if (asUnit) return qty;
  return qty * packOf(p);
}

export function lineLabel(p: Product | undefined, qty: number, asUnit?: boolean): string {
  const pack = packOf(p);
  if (asUnit || pack <= 1) return `${qty} u.`;
  return `${qty} pack · ${qty * pack} u.`;
}

export function stockBreakdown(p: { stock: number; packQty?: number | null }): string {
  return `${p.stock} u.`;
}

export function suggestPacks(p: Product): number {
  const pack = packOf(p);
  const need = Math.max(p.stockMin * 2 - p.stock, p.stockMin || pack);
  return Math.max(1, Math.ceil(need / pack));
}

export function shortCodeOf(p: { shortCode?: string | null }): string {
  return String(p.shortCode ?? "").trim();
}

export function productMatchesQuery(p: Product, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  const code = n.replace(/\s/g, "");
  const short = shortCodeOf(p).toLowerCase();
  return (
    p.name.toLowerCase().includes(n) ||
    p.barcode.toLowerCase().includes(code) ||
    Boolean(p.packBarcode && p.packBarcode.toLowerCase().includes(code)) ||
    (short !== "" && (short === code || short.includes(code)))
  );
}

export function findByScan(
  products: Product[],
  raw: string,
): { product: Product; units: number; kind: "unit" | "pack" } | null {
  const q = raw.trim().replace(/\s/g, "");
  if (!q) return null;
  const packHit = products.find((p) => p.active && p.packBarcode && p.packBarcode === q);
  if (packHit) return { product: packHit, units: packOf(packHit), kind: "pack" };
  const unit = products.find((p) => p.active && p.barcode === q);
  if (unit) return { product: unit, units: 1, kind: "unit" };
  const short = products.find((p) => p.active && shortCodeOf(p).toLowerCase() === q.toLowerCase());
  if (short) return { product: short, units: 1, kind: "unit" };
  return null;
}

export function orderNote(
  supplierName: string,
  storeName: string,
  lines: OrderLine[],
  products: Product[],
): string {
  const body = lines.map((l) => {
    const p = products.find((x) => x.id === l.productId);
    return `• ${lineLabel(p, l.qty, l.asUnit)} ${l.name}`;
  });
  return [`Pedido ${supplierName} — ${storeName}`, "", ...body, "", "Gracias."].join("\n");
}

export function waHref(phone: string, text: string): string | null {
  const n = phone.replace(/\D/g, "");
  if (n.length < 8) return null;
  const full = n.startsWith("54") ? n : `54${n.replace(/^0/, "")}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export function receiveSummary(lines: OrderLine[], products: Product[]): string {
  const parts = lines.map((l) => {
    const p = products.find((x) => x.id === l.productId);
    const units = lineUnits(p, l.qty, l.asUnit);
    return `${l.name} +${units} u.`;
  });
  return parts.slice(0, 3).join(" · ");
}
