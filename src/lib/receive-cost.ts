/**
 * Recepción contra lo pedido: cuánto entra de cada renglón, y si cargaron
 * costo, el precio de góndola (misma cuenta que Actualizar precios).
 * El stock de un renglón que no llegó no se toca.
 */
import { packOf } from "./pack.ts";
import {
  factorFor,
  hasFactor,
  quotedPrice,
  shelfInvoice,
  unitCost,
} from "./pricing.ts";
import { avisosDeCosto } from "./costo-guia.ts";
import type { Category, OrderLine, Product, Settings, Supplier } from "./types.ts";

export type ReceiveReceipt = {
  productId: string;
  units: number;
  asUnit?: boolean;
  cost?: number | null;
  desdeBulto?: boolean;
};

export function orderLineKey(l: Pick<OrderLine, "productId" | "asUnit">, i: number): string {
  return `${l.productId}-${l.asUnit ? "u" : "p"}-${i}`;
}

export function planReceive(
  lines: OrderLine[],
  products: Product[],
  receipts: ReceiveReceipt[],
): {
  qtyByProduct: Map<string, number>;
  nextLines: OrderLine[];
  short: boolean;
  costs: { productId: string; cost: number; desdeBulto: boolean }[];
} {
  const used = new Set<number>();
  const gotFor = (l: OrderLine): { units: number; cost: number | null; desdeBulto: boolean } => {
    const exact = receipts.findIndex(
      (r, i) =>
        !used.has(i) &&
        r.productId === l.productId &&
        r.asUnit !== undefined &&
        Boolean(r.asUnit) === Boolean(l.asUnit),
    );
    const loose = receipts.findIndex((r, i) => !used.has(i) && r.productId === l.productId);
    const hit = exact >= 0 ? exact : loose;
    if (hit < 0) return { units: 0, cost: null, desdeBulto: false };
    used.add(hit);
    const r = receipts[hit]!;
    const cost = r.cost != null && r.cost > 0 ? Math.round(r.cost) : null;
    return {
      units: Math.max(0, Math.floor(Number(r.units) || 0)),
      cost,
      desdeBulto: Boolean(r.desdeBulto),
    };
  };
  const qtyByProduct = new Map<string, number>();
  const costByProduct = new Map<string, { cost: number; desdeBulto: boolean }>();
  let short = false;
  const nextLines = lines.map((l) => {
    const p = products.find((x) => x.id === l.productId);
    const expected = p ? (l.asUnit ? l.qty : l.qty * packOf(p)) : l.qty;
    const got = gotFor(l);
    if (got.units < expected) short = true;
    if (got.units > 0) qtyByProduct.set(l.productId, (qtyByProduct.get(l.productId) ?? 0) + got.units);
    if (got.cost != null) costByProduct.set(l.productId, { cost: got.cost, desdeBulto: got.desdeBulto });
    return { ...l, receivedUnits: got.units };
  });
  return {
    qtyByProduct,
    nextLines,
    short,
    costs: [...costByProduct.entries()].map(([productId, c]) => ({ productId, ...c })),
  };
}

/** Precio de góndola a partir del costo, misma cuenta que price-calc. Sin margen, el precio no se toca. */
export function costoAGondola(
  p: Product,
  cost: number,
  categories: Category[],
  suppliers: Supplier[],
  settings: Settings,
  opts?: { desdeBulto?: boolean },
): { cost: number; price: number | null; avisos: string[] } {
  const c = Math.round(cost);
  const rubro = categories.find((x) => x.id === p.categoryId);
  const fac = shelfInvoice(p, suppliers);
  const step = settings.roundStep && settings.roundStep > 0 ? settings.roundStep : 100;
  const mode = settings.roundMode === "down" ? "down" : "up";
  const price =
    rubro && hasFactor(rubro, fac, settings)
      ? quotedPrice({ ...p, cost: c }, factorFor(rubro, fac, settings), step, mode)
      : null;
  const avisos = avisosDeCosto({
    costo: c,
    costoAntes: unitCost(p),
    precioNuevo: price ?? 0,
    bulto: packOf(p),
    desdeBulto: Boolean(opts?.desdeBulto),
  });
  return { cost: c, price, avisos };
}
