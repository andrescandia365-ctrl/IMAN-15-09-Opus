import { uid } from "./utils.ts";
import type { Product } from "@/lib/types";

export type StockLot = {
  id: string;
  expiresAt: string;
  units: number;
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

/**
 * Descuenta del lote que vence primero. Es una cuenta pura: con los mismos
 * lotes y la misma cantidad da lo mismo en cualquier aparato, y dos ventas dan
 * lo mismo en cualquier orden. Por eso applyEvent la vuelve a correr en el
 * aparato que recibe la venta, en lugar de mandar los lotes en el evento.
 */
export function consumeFifo(p: Product, qty: number): Product {
  const take = Math.max(0, Math.floor(qty));
  if (take <= 0) return p;
  const lots = lotsOf(p);
  // Sin lotes, la fecha es la del producto entero: vender una unidad no la borra.
  if (!lots.length) return { ...p, stock: Math.max(0, p.stock - take) };
  let left = take;
  const next: StockLot[] = [];
  for (const l of lots.slice().sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))) {
    if (left <= 0) {
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

export function addLot(p: Product, expiresAt: string, units: number): { ok: true; product: Product } | { ok: false; error: string } {
  const date = expiresAt.trim();
  const want = Math.max(0, Math.floor(Number(units) || 0));
  if (!date) return { ok: false, error: "Falta la fecha" };
  if (want <= 0) return { ok: false, error: "Cuántas unidades" };
  const free = unallocated(p);
  if (free <= 0) return { ok: false, error: "No hay stock sin fecha para ese lote" };
  const n = Math.min(want, free);
  const lots = [...lotsOf(p), { id: uid("lt"), expiresAt: date, units: n }];
  lots.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  return {
    ok: true,
    product: { ...p, lots, expiresAt: lots[0]?.expiresAt ?? date },
  };
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
