import { lotsOf } from "./lots.ts";
import { unitCost } from "./pricing.ts";
import type { Product } from "./types.ts";

/**
 * Qué conviene promocionar: lo que vence pronto (sugiere Liquidación) y lo que
 * no se vende (Oferta o Combo). Ordenado por la plata en riesgo: unidades por
 * costo. Sin costo cargado va al final: no se sabe cuánto es.
 */

export const VENCE_DIAS = [7, 15, 30] as const;
export const SIN_VENTA_DIAS = [15, 30, 60] as const;
export const VENCE_DEFAULT = 15;
export const SIN_VENTA_DEFAULT = 30;

export type Sugerencia = {
  productId: string;
  nombre: string;
  /** "vence en 6 días, quedan 10" */
  motivo: string;
  unidades: number;
  costo: number | null;
  /** unidades × costo; null sin costo cargado. */
  plata: number | null;
  plantilla: "liquidacion" | "oferta";
};

/** Días entre dos fechas locales YYYY-MM-DD (o con hora): b − a. */
function dias(desde: string, hasta: string): number {
  const f = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((f(hasta) - f(desde)) / 86_400_000);
}

/** Fecha local YYYY-MM-DD de un momento ISO. */
function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const u = (n: number) => (n === 1 ? "queda 1" : `quedan ${n}`);

function ordenar(a: Sugerencia, b: Sugerencia): number {
  if (a.plata == null && b.plata == null) return b.unidades - a.unidades;
  if (a.plata == null) return 1;
  if (b.plata == null) return -1;
  return b.plata - a.plata;
}

/** Lotes que vencen de hoy a `plazo` días. Solo cuentan las unidades de esos lotes. */
export function porVencer(products: Product[], hoy: string, plazo: number): Sugerencia[] {
  const out: Sugerencia[] = [];
  for (const p of products) {
    if (!p.active || p.stock <= 0) continue;
    const lotes = lotsOf(p).length
      ? lotsOf(p).map((l) => ({ vence: l.expiresAt, unidades: l.units }))
      : p.expiresAt
        ? [{ vence: p.expiresAt, unidades: p.stock }]
        : [];
    const pronto = lotes
      .map((l) => ({ ...l, en: dias(hoy, l.vence) }))
      .filter((l) => l.en >= 0 && l.en <= plazo)
      .sort((a, b) => a.en - b.en);
    if (!pronto.length) continue;
    const unidades = Math.min(p.stock, pronto.reduce((a, l) => a + l.unidades, 0));
    const en = pronto[0]!.en;
    const costo = unitCost(p);
    out.push({
      productId: p.id,
      nombre: p.name,
      motivo: `${en === 0 ? "vence hoy" : en === 1 ? "vence mañana" : `vence en ${en} días`}, ${u(unidades)}`,
      unidades,
      costo,
      plata: costo == null ? null : costo * unidades,
      plantilla: "liquidacion",
    });
  }
  return out.sort(ordenar);
}

/**
 * Con stock y sin ventas hace `plazo` días o más. Un producto sin venta
 * anotada cuenta desde que el local empezó a anotarlas (`desde`): antes de
 * eso no se sabe, y no se inventa.
 */
export function noSeVenden(
  products: Product[],
  ultima: Record<string, string>,
  desde: string | undefined,
  hoy: string,
  plazo: number,
  excluir: Set<string> = new Set(),
): Sugerencia[] {
  const out: Sugerencia[] = [];
  for (const p of products) {
    if (!p.active || p.stock <= 0 || excluir.has(p.id)) continue;
    const vendida = ultima[p.id];
    const base = vendida ?? desde;
    if (!base) continue;
    const hace = dias(diaLocal(base), hoy);
    if (hace < plazo) continue;
    const costo = unitCost(p);
    out.push({
      productId: p.id,
      nombre: p.name,
      motivo: `${vendida ? `sin ventas hace ${hace} días` : `sin ventas en ${hace} días`}, ${u(p.stock)}`,
      unidades: p.stock,
      costo,
      plata: costo == null ? null : costo * p.stock,
      plantilla: "oferta",
    });
  }
  return out.sort(ordenar);
}

/** La última venta de cada producto, con las de una venta nueva. */
export function anotarVenta(
  ultima: Record<string, string> | undefined,
  items: { productId: string }[],
  at: string,
): Record<string, string> {
  const next = { ...(ultima ?? {}) };
  for (const it of items) if (!next[it.productId] || next[it.productId]! < at) next[it.productId] = at;
  return next;
}

/** Dos copias: la venta más nueva de cada producto. */
export function juntarUltimas(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): Record<string, string> {
  const next = { ...(a ?? {}) };
  for (const [id, at] of Object.entries(b ?? {})) if (!next[id] || next[id]! < at) next[id] = at;
  return next;
}

/** Desde cuándo se anota: el más viejo de los dos (el que más sabe). */
export function juntarDesde(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
