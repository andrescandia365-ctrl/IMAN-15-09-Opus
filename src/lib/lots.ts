import { uid } from "./utils.ts";
import type { Product } from "@/lib/types";

export type StockLot = {
  id: string;
  expiresAt: string;
  units: number;
  /** Alta del lote. Sin esto (lotes viejos) cuenta como anterior a cualquier venta. */
  createdAt?: string;
};

export function lotsOf(p: { lots?: StockLot[] } | undefined): StockLot[] {
  return (p?.lots ?? []).filter((l) => l.units > 0 && Boolean(l.expiresAt));
}

export function unallocated(p: Product): number {
  const used = lotsOf(p).reduce((a, l) => a + l.units, 0);
  return Math.max(0, p.stock - used);
}

export function soonestExpiry(p: Product): string | null {
  const lots = lotsOf(p).slice().sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  return lots[0]?.expiresAt ?? p.expiresAt ?? null;
}

/** Un lote sin alta, o dado de alta no después de `asOf`, existía cuando pasó el evento. */
function existiaAl(l: StockLot, asOf?: string): boolean {
  if (!asOf || !l.createdAt) return true;
  return l.createdAt <= asOf;
}

/**
 * Descuenta del lote que vence primero, entre los que ya existían en `asOf`.
 * Un lote fechado después de la venta no se toca, aunque venza antes. Es una
 * cuenta pura: el evento sale no manda los lotes; cada aparato la corre con
 * `ev.at`. Sin `asOf` (o lotes viejos sin createdAt) es el FIFO de siempre.
 */
export function consumeFifo(p: Product, qty: number, asOf?: string): Product {
  const take = Math.max(0, Math.floor(qty));
  if (take <= 0) return p;
  const lots = lotsOf(p);
  // Sin lotes, la fecha es la del producto entero: vender una unidad no la borra.
  if (!lots.length) return { ...p, stock: Math.max(0, p.stock - take) };
  let left = take;
  const next: StockLot[] = [];
  for (const l of lots.slice().sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))) {
    if (!existiaAl(l, asOf) || left <= 0) {
      next.push(l);
      continue;
    }
    const n = Math.min(l.units, left);
    left -= n;
    if (l.units - n > 0) next.push({ ...l, units: l.units - n });
  }
  return {
    ...p,
    stock: Math.max(0, p.stock - take),
    lots: next,
    expiresAt: next[0]?.expiresAt ?? null,
  };
}

/**
 * Pone un lote ya armado en su lugar, ordenado por vencimiento. La usan fechar
 * (addLot) y el evento `lot` que llega de otro aparato, así los dos quedan
 * iguales. Si ese lote ya está, no hace nada: el mismo evento dos veces no lo
 * duplica.
 */
export function insertLot(p: Product, lot: StockLot): Product {
  if ((p.lots ?? []).some((l) => l.id === lot.id)) return p;
  const lots = [...lotsOf(p), lot];
  lots.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  return { ...p, lots, expiresAt: lots[0]?.expiresAt ?? lot.expiresAt };
}

export function addLot(
  p: Product,
  expiresAt: string,
  units: number,
): { ok: true; product: Product; lot: StockLot } | { ok: false; error: string } {
  const date = expiresAt.trim();
  const want = Math.max(0, Math.floor(Number(units) || 0));
  if (!date) return { ok: false, error: "Falta la fecha" };
  if (want <= 0) return { ok: false, error: "Cuántas unidades" };
  const free = unallocated(p);
  if (free <= 0) return { ok: false, error: "No hay stock sin fecha para ese lote" };
  const lot: StockLot = {
    id: uid("lt"),
    expiresAt: date,
    units: Math.min(want, free),
    createdAt: new Date().toISOString(),
  };
  return { ok: true, product: insertLot(p, lot), lot };
}

export function setLot(p: Product, lotId: string, patch: Partial<Pick<StockLot, "expiresAt" | "units">>): Product {
  const lots = lotsOf(p)
    .map((l) => {
      if (l.id !== lotId) return l;
      const units = patch.units != null ? Math.max(0, Math.floor(patch.units)) : l.units;
      const expiresAt = patch.expiresAt?.trim() || l.expiresAt;
      return { ...l, units, expiresAt };
    })
    .filter((l) => l.units > 0);
  lots.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  return { ...p, lots, expiresAt: lots[0]?.expiresAt ?? null };
}
