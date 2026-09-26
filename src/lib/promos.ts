import type { Promo, PromoKind, Sale, TicketLine } from "./types.ts";

/**
 * Las promos que cobra la caja. Van aparte del precio de góndola: el precio
 * del producto no se toca, así alinear un rubro o Actualizar precios no pisan
 * una oferta, y al terminar la promo el precio vuelve solo.
 *
 * Se calcula al cobrar, no al sumar la línea: un ticket que armó un celu de
 * piso, o uno que quedó abierto cuando terminó la promo, se cobra con lo que
 * vale en ese momento.
 */

export const PROMO_NOMBRE: Record<PromoKind, string> = {
  oferta: "Oferta",
  liquidacion: "Liquidación",
  "2x1": "2x1",
  combo: "Combo",
};

/** Vigente el día `hoy` (todayKey, fecha local): entre `from` y `until`, los dos incluidos. */
export function vigente(p: Promo, hoy: string): boolean {
  return !p.endedAt && p.from <= hoy && hoy <= p.until;
}

/** Terminadas (por fecha o a mano) cuyo cartel nadie confirmó que sacó. */
export function cartelesPorSacar(promos: Promo[], hoy: string): Promo[] {
  return promos.filter((p) => !p.retiradaAt && (Boolean(p.endedAt) || hoy > p.until));
}

export type CobroItem = {
  productId: string;
  name: string;
  qty: number;
  /** Por unidad, lo que se cobra. */
  price: number;
  /** Por unidad, el de góndola. */
  listPrice: number;
  promoId?: string;
  /** Unidades que entraron en la promo. */
  promoQty?: number;
};

export type Cobro = {
  items: CobroItem[];
  total: number;
  /** Lo que se descontó con promos. */
  ahorro: number;
  aplicadas: { promoId: string; name: string; kind: PromoKind; veces: number; ahorro: number }[];
};

const cents = (n: number) => Math.round(n * 100);

/**
 * Lo que se cobra por el ticket con las promos vigentes. Nunca cobra más que
 * la góndola: una promo que no abarata (porque el precio de góndola bajó
 * después) no se aplica.
 *
 * Orden: primero los combos y los 2x1 (conjuntos completos, el que más
 * descuenta primero), después las ofertas y liquidaciones por unidad sobre lo
 * que quedó, y lo demás a precio de góndola. Un producto queda en un solo
 * renglón: si tiene unidades en promo y sueltas, el precio por unidad es el
 * promedio.
 */
export function cobrar(lines: TicketLine[], promos: Promo[], hoy: string): Cobro {
  type Estado = { line: TicketLine; qty: number; left: number; totalC: number; promoId?: string; promoQty: number };
  const porProducto = new Map<string, Estado>();
  for (const l of lines) {
    if (l.qty <= 0) continue;
    const cur = porProducto.get(l.productId);
    if (cur) {
      cur.qty += l.qty;
      cur.left += l.qty;
    } else porProducto.set(l.productId, { line: l, qty: l.qty, left: l.qty, totalC: 0, promoQty: 0 });
  }
  const vigentes = promos.filter((p) => vigente(p, hoy) && p.items.length && p.price >= 0);
  const aplicadas = new Map<string, Cobro["aplicadas"][number]>();
  const anotar = (p: Promo, veces: number, ahorroC: number) => {
    const cur = aplicadas.get(p.id) ?? { promoId: p.id, name: p.name, kind: p.kind, veces: 0, ahorro: 0 };
    cur.veces += veces;
    cur.ahorro += ahorroC / 100;
    aplicadas.set(p.id, cur);
  };

  // Conjuntos: 2x1 y combos.
  const conjuntos = vigentes
    .filter((p) => p.kind === "combo" || p.kind === "2x1")
    .map((p) => {
      const listaC = p.items.reduce((a, it) => a + it.qty * cents(porProducto.get(it.productId)?.line.price ?? 0), 0);
      return { p, listaC, ahorroC: listaC - cents(p.price) };
    })
    .filter((c) => c.ahorroC > 0 && c.p.items.every((it) => it.qty > 0 && porProducto.has(it.productId)))
    .sort((a, b) => b.ahorroC - a.ahorroC);
  for (const { p, listaC, ahorroC } of conjuntos) {
    const veces = Math.min(...p.items.map((it) => Math.floor(porProducto.get(it.productId)!.left / it.qty)));
    if (veces <= 0) continue;
    // El precio del conjunto se reparte según lo que pesa cada producto en la
    // góndola, en pesos enteros; el último se lleva lo que sobra del redondeo.
    const precioC = cents(p.price);
    let repartido = 0;
    p.items.forEach((it, i) => {
      const e = porProducto.get(it.productId)!;
      const peso = (it.qty * cents(e.line.price)) / listaC;
      const parte = i === p.items.length - 1 ? precioC - repartido : Math.floor((precioC * peso) / 100) * 100;
      repartido += parte;
      e.totalC += parte * veces;
      e.left -= it.qty * veces;
      e.promoQty += it.qty * veces;
      e.promoId = p.id;
    });
    anotar(p, veces, ahorroC * veces);
  }

  // Por unidad: ofertas y liquidaciones, la más barata si hay más de una.
  const sueltas = vigentes.filter((p) => p.kind === "oferta" || p.kind === "liquidacion");
  for (const e of porProducto.values()) {
    if (e.left <= 0) continue;
    const listaC = cents(e.line.price);
    const mejor = sueltas
      .filter((p) => p.items[0]?.productId === e.line.productId && cents(p.price) < listaC)
      .sort((a, b) => a.price - b.price)[0];
    if (!mejor) continue;
    e.totalC += e.left * cents(mejor.price);
    anotar(mejor, e.left, e.left * (listaC - cents(mejor.price)));
    e.promoId = e.promoId ?? mejor.id;
    e.promoQty += e.left;
    e.left = 0;
  }

  const items: CobroItem[] = [];
  let totalC = 0;
  let listaTotalC = 0;
  for (const e of porProducto.values()) {
    e.totalC += e.left * cents(e.line.price);
    const qty = e.qty;
    totalC += e.totalC;
    listaTotalC += qty * cents(e.line.price);
    items.push({
      productId: e.line.productId,
      name: e.line.name,
      qty,
      price: e.totalC / 100 / qty,
      listPrice: e.line.price,
      ...(e.promoId ? { promoId: e.promoId, promoQty: e.promoQty } : {}),
    });
  }
  return { items, total: totalC / 100, ahorro: (listaTotalC - totalC) / 100, aplicadas: [...aplicadas.values()] };
}

/** Lo que una venta cobró en promo y lo que se descontó. */
export function promoDeVenta(s: Pick<Sale, "items">): { total: number; ahorro: number } {
  let total = 0;
  let ahorro = 0;
  for (const it of s.items) {
    if (!it.promoId) continue;
    // Las unidades sueltas del mismo renglón (la tercera de un 2x1) no son promo.
    const sueltas = typeof it.listPrice === "number" ? it.qty - (it.promoQty ?? it.qty) : 0;
    total += it.price * it.qty - sueltas * (it.listPrice ?? 0);
    if (typeof it.listPrice === "number") ahorro += (it.listPrice - it.price) * it.qty;
  }
  return { total, ahorro };
}

function esPromo(v: unknown): v is Promo {
  const p = v as Partial<Promo> | null;
  return Boolean(
    p &&
      typeof p.id === "string" &&
      p.id &&
      typeof p.kind === "string" &&
      p.kind in PROMO_NOMBRE &&
      Array.isArray(p.items) &&
      typeof p.price === "number" &&
      typeof p.from === "string" &&
      typeof p.until === "string" &&
      typeof p.updatedAt === "string",
  );
}

/** El evento `promo` trae la promo entera: gana la de `updatedAt` más nuevo. */
export function aplicarPromo(promos: Promo[] | undefined, body: unknown): Promo[] | null {
  const promo = (body as { promo?: unknown } | null)?.promo;
  if (!esPromo(promo)) return null;
  const lista = promos ?? [];
  const cur = lista.find((p) => p.id === promo.id);
  if (cur && cur.updatedAt > promo.updatedAt) return null;
  return cur ? lista.map((p) => (p.id === promo.id ? promo : p)) : [promo, ...lista];
}

/** Dos copias del local: todas las promos de los dos lados, cada una en su versión más nueva. */
export function juntarPromos(a: Promo[] | undefined, b: Promo[] | undefined): Promo[] {
  const map = new Map<string, Promo>();
  for (const p of [...(a ?? []), ...(b ?? [])]) {
    const cur = map.get(p.id);
    if (!cur || p.updatedAt >= cur.updatedAt) map.set(p.id, p);
  }
  return [...map.values()].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
}

/** El importe de una línea como la cobra la caja, con la marca si va en promo. */
export function importeDeLinea(cobro: Cobro, productId: string, fallback: number): { importe: number; promo: boolean } {
  const it = cobro.items.find((i) => i.productId === productId);
  return it ? { importe: it.price * it.qty, promo: Boolean(it.promoId) } : { importe: fallback, promo: false };
}
