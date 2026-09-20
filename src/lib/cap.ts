import type {
  CashDrop,
  CashShift,
  DayBook,
  KioskPayload,
  MonthAgg,
  MonthSheet,
  OrderDraft,
  Product,
  Refund,
  Sale,
  SaleItem,
  StockMove,
} from "@/lib/types";
import { unitCost } from "./pricing.ts";
import { mergeDeleted } from "./deleted.ts";

/** Live tickets we keep in the blob. Older ones fold into monthAggs. */
export const SALES_KEEP = 1500;
export const SALES_DAYS = 7;
export const MOVEMENTS_KEEP = 150;
export const SHIFTS_KEEP = 90;
export const DROPS_KEEP = 80;
export const ORDERS_KEEP = 40;
export const REFUNDS_KEEP = 200;
export const PAYOUTS_KEEP = 200;
export const BOOKS_KEEP = 400;
/**
 * Tope del JSON **crudo** (después de inflar gzip). No es el tamaño al cable:
 * Vercel admite ~4,5 MB de request; Postgres jsonb aguanta mucho más.
 * Protege RAM al parsear y un zip bomb. 4 MB deja ~5–6 mil productos al
 * tamaño de hoy; un aparato viejo que manda sin comprimir sigue debajo del
 * tope de Vercel.
 */
export const MAX_JSON_BYTES = 4_000_000;

function ymOf(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Lo que costó una línea vendida: primero el costo que guardó la venta, y si es
 * una venta vieja que no lo trae, el costo de hoy del producto. Sin ninguno de
 * los dos, `null`: la línea se cuenta como faltante y no suma nada. Nunca un
 * porcentaje del precio — eso hacía el método viejo y por eso los meses
 * plegados así vienen marcados como no confiables.
 */
function lineCost(it: SaleItem, byId: Map<string, Product>): number | null {
  if (typeof it.cost === "number" && it.cost > 0) return it.cost;
  const p = byId.get(it.productId);
  return p ? unitCost(p) : null;
}

function emptyAgg(ym: string): MonthAgg {
  return {
    ym,
    ventas: 0,
    tickets: 0,
    mp: 0,
    efectivo: 0,
    debito: 0,
    cogs: 0,
    cogsMissing: 0,
    cogsTrusted: true,
    devoluciones: 0,
    devolucionesCogs: 0,
  };
}

function foldSale(map: Map<string, MonthAgg>, s: Sale, byId: Map<string, Product>): void {
  const ym = ymOf(s.createdAt);
  const cur = map.get(ym) ?? {
    ym,
    ventas: 0,
    tickets: 0,
    mp: 0,
    efectivo: 0,
    debito: 0,
    cogs: 0,
    cogsMissing: 0,
    cogsTrusted: true,
  };
  cur.ventas += s.total;
  cur.tickets += 1;
  if (s.paymentMethod === "mercadopago") cur.mp += s.total;
  else if (s.paymentMethod === "efectivo") cur.efectivo += s.total;
  else cur.debito += s.total;
  for (const it of s.items) {
    const c = lineCost(it, byId);
    if (c == null) cur.cogsMissing = (cur.cogsMissing ?? 0) + it.qty;
    else cur.cogs += c * it.qty;
  }
  map.set(ym, cur);
}

/**
 * Lo que había costado lo que el cliente devolvió: primero el costo que guardó
 * la línea de la venta original, después el costo de hoy del producto, y si no
 * hay ninguno la unidad se cuenta como faltante. Nunca estimado.
 */
function foldRefund(
  map: Map<string, MonthAgg>,
  r: Refund,
  byId: Map<string, Product>,
  salesById: Map<string, Sale>,
): void {
  const ym = ymOf(r.createdAt);
  const cur = map.get(ym) ?? emptyAgg(ym);
  cur.devoluciones = (cur.devoluciones ?? 0) + r.amount;
  const linea = r.saleId
    ? salesById.get(r.saleId)?.items.find((it) => it.productId === r.productId)
    : undefined;
  const prod = byId.get(r.productId);
  const c =
    typeof linea?.cost === "number" && linea.cost > 0 ? linea.cost : prod ? unitCost(prod) : null;
  if (c == null) cur.cogsMissing = (cur.cogsMissing ?? 0) + r.units;
  else cur.devolucionesCogs = (cur.devolucionesCogs ?? 0) + c * r.units;
  map.set(ym, cur);
}

export function mergeAggs(a: MonthAgg[], b: MonthAgg[]): MonthAgg[] {
  const map = new Map<string, MonthAgg>();
  for (const row of [...a, ...b]) {
    const cur = map.get(row.ym);
    if (!cur) {
      map.set(row.ym, { ...row });
      continue;
    }
    map.set(row.ym, {
      ym: row.ym,
      ventas: cur.ventas + row.ventas,
      tickets: cur.tickets + row.tickets,
      mp: cur.mp + row.mp,
      efectivo: cur.efectivo + row.efectivo,
      debito: cur.debito + row.debito,
      cogs: cur.cogs + row.cogs,
      cogsMissing: (cur.cogsMissing ?? 0) + (row.cogsMissing ?? 0),
      // Basta con que una mitad venga del método viejo para no poder confiar.
      cogsTrusted: cur.cogsTrusted === true && row.cogsTrusted === true,
      devoluciones: (cur.devoluciones ?? 0) + (row.devoluciones ?? 0),
      devolucionesCogs: (cur.devolucionesCogs ?? 0) + (row.devolucionesCogs ?? 0),
    });
  }
  return [...map.values()].sort((x, y) => y.ym.localeCompare(x.ym)).slice(0, 36);
}

/**
 * El mismo mes en dos copias del local (la fotocopia y la del aparato) es el
 * mismo resumen visto dos veces, no dos cajas: hay una sola caja por local.
 * Gana el que tiene más tickets, y si empatan el de este aparato. mergeAggs los
 * suma, que es lo que va al plegar ventas nuevas; al juntar copias duplicaba
 * "El mes" en cada recarga.
 */
export function sameAggs(server: MonthAgg[], local: MonthAgg[]): MonthAgg[] {
  const map = new Map<string, MonthAgg>();
  for (const row of server) map.set(row.ym, row);
  for (const row of local) {
    const cur = map.get(row.ym);
    map.set(row.ym, cur && cur.tickets > row.tickets ? cur : row);
  }
  return [...map.values()].sort((x, y) => y.ym.localeCompare(x.ym)).slice(0, 36);
}

function keepNewest<T extends { createdAt: string }>(rows: T[], n: number): T[] {
  if (rows.length <= n) return rows;
  return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, n);
}

/** Trim the JSON blob so a busy till does not explode the save. */
export function prunePayload(p: KioskPayload): KioskPayload {
  const cutoff = Date.now() - SALES_DAYS * 86_400_000;
  const keep: Sale[] = [];
  const folded: Sale[] = [];
  const sales = [...p.sales].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  for (const s of sales) {
    const old = new Date(s.createdAt).getTime() < cutoff;
    if (!old && keep.length < SALES_KEEP) keep.push(s);
    else folded.push(s);
  }
  const extra: MonthAgg[] = [];
  const map = new Map<string, MonthAgg>();
  const byId = new Map(p.products.map((x) => [x.id, x]));
  for (const s of folded) foldSale(map, s, byId);

  // Las devoluciones a clientes se pliegan con el mismo corte que las ventas y
  // salen de la lista. Si se quedaran, cada guardado las volvería a sumar al
  // mes: la venta no se duplica porque al plegarse se va, y acá igual.
  const salesById = new Map(p.sales.map((x) => [x.id, x]));
  const refundsKeep: Refund[] = [];
  for (const r of p.refunds ?? []) {
    const viejo = new Date(r.createdAt).getTime() < cutoff;
    if (r.kind === "cliente" && viejo) foldRefund(map, r, byId, salesById);
    else refundsKeep.push(r);
  }
  extra.push(...map.values());

  const bookCut = Date.now() - BOOKS_KEEP * 86_400_000;
  const books = (p.books ?? []).filter((b: DayBook) => new Date(b.date).getTime() >= bookCut);
  const monthSheets = [...(p.monthSheets ?? [])]
    .sort((a, b) => b.ym.localeCompare(a.ym))
    .slice(0, 12);

  return {
    ...p,
    sales: keep,
    movements: keepNewest(p.movements, MOVEMENTS_KEEP),
    shifts: [...p.shifts].sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1)).slice(0, SHIFTS_KEEP),
    drops: keepNewest(p.drops, DROPS_KEEP),
    orders: keepNewest(p.orders, ORDERS_KEEP),
    refunds: keepNewest(refundsKeep, REFUNDS_KEEP),
    payouts: keepNewest(p.payouts ?? [], PAYOUTS_KEEP),
    roster: (p.roster ?? []).filter((r) => {
      const t = new Date(`${r.date}T12:00:00`).getTime();
      return t >= Date.now() - 45 * 86_400_000;
    }),
    books,
    monthAggs: mergeAggs(p.monthAggs ?? [], extra),
    monthSheets,
    ticket: p.ticket.slice(0, 80),
  };
}

export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function hasCatalog(p: KioskPayload | null | undefined): boolean {
  return Boolean(p && (p.products.length > 0 || p.sales.length > 0));
}

function namedLines(o: OrderDraft): number {
  return (o.lines ?? []).filter((l) => l.productId && (l.name || l.qty)).length;
}

/** Keep the more complete piece: received > sent > more renglones. */
export function richerOrder(a: OrderDraft, b: OrderDraft): OrderDraft {
  if (a.received !== b.received) return a.received ? a : b;
  if (a.sent !== b.sent) return a.sent ? a : b;
  const an = namedLines(a);
  const bn = namedLines(b);
  if (an !== bn) return an > bn ? a : b;
  if ((a.lines?.length ?? 0) !== (b.lines?.length ?? 0)) {
    return (a.lines?.length ?? 0) > (b.lines?.length ?? 0) ? a : b;
  }
  const aDates = (a.liftAt ? 1 : 0) + (a.deliverAt ? 1 : 0);
  const bDates = (b.liftAt ? 1 : 0) + (b.deliverAt ? 1 : 0);
  if (aDates !== bDates) return aDates > bDates ? a : b;
  return (a.createdAt ?? "") >= (b.createdAt ?? "") ? a : b;
}

export function mergeOrders(server: OrderDraft[] | undefined, local: OrderDraft[] | undefined): OrderDraft[] {
  const map = new Map<string, OrderDraft>();
  for (const o of [...(server ?? []), ...(local ?? [])]) {
    if (!o?.id) continue;
    const cur = map.get(o.id);
    map.set(o.id, cur ? richerOrder(cur, o) : o);
  }
  return [...map.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Two tills: keep every ticket. An empty new device must not wipe the photocopy. */
export function mergePayload(server: KioskPayload, local: KioskPayload): KioskPayload {
  if (!hasCatalog(local) && hasCatalog(server)) {
    return prunePayload({
      ...server,
      orders: mergeOrders(server.orders, local.orders),
    });
  }
  // Una venta vieja que solo tiene la fotocopia ya está plegada en el resumen de
  // este aparato (hay una sola caja). Si entrara, al recortar se volvería a
  // plegar y el mes quedaría contado de más. Lo mismo con las devoluciones.
  const cutoff = Date.now() - SALES_DAYS * 86_400_000;
  const viejo = (iso: string) => new Date(iso).getTime() < cutoff;
  const salesById = new Map<string, Sale>();
  for (const s of server.sales) if (!viejo(s.createdAt)) salesById.set(s.id, s);
  for (const s of local.sales) salesById.set(s.id, s);
  const sales = [...salesById.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const refundsById = new Map<string, NonNullable<KioskPayload["refunds"]>[number]>();
  for (const r of server.refunds ?? []) if (r.kind !== "cliente" || !viejo(r.createdAt)) refundsById.set(r.id, r);
  for (const r of local.refunds ?? []) refundsById.set(r.id, r);
  const refunds = [...refundsById.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const products = local.products.length ? local.products : server.products;
  // Los borrados de los dos lados, menos los productos que están: si se
  // recargó el catálogo de ejemplo, la lista vieja de la fotocopia no los frena.
  const vivos = new Set(products.map((p) => p.id));
  const deletedProducts = mergeDeleted(server.deletedProducts, local.deletedProducts).filter((d) => !vivos.has(d.id));
  const categories = local.categories.length ? local.categories : server.categories;
  // Proveedores y ajustes viajan por la cinta. Este aparato ya los aplicó:
  // la fotocopia del otro no los pisa (last-write es el evento, no quien sube).
  const suppliers = local.suppliers;
  const settings = {
    ...server.settings,
    ...local.settings,
    name: local.settings.name?.trim() || server.settings.name,
    city: local.settings.city?.trim() || server.settings.city,
    ownerPinHash: local.settings.ownerPinHash || server.settings.ownerPinHash,
    storeLogo: local.settings.storeLogo || server.settings.storeLogo,
  };
  return prunePayload({
    ...server,
    ...local,
    products,
    categories,
    suppliers,
    settings,
    sales,
    refunds,
    orders: mergeOrders(server.orders, local.orders),
    monthAggs: sameAggs(server.monthAggs ?? [], local.monthAggs ?? []),
    monthSheets: mergeSheets(server.monthSheets ?? [], local.monthSheets ?? []),
    deletedProducts,
    ticket: local.ticket?.length ? local.ticket : server.ticket,
  });
}

/**
 * Un cierre con efectivo contado gana; después, el turno abierto; al final, un
 * cierre sin efectivo contado, que no es un cierre de verdad (así cerraba los
 * turnos abiertos la restauración de una copia). Si empatan, el de este aparato.
 */
function shiftRank(s: CashShift): number {
  if (s.status === "open") return 1;
  return s.closingCash != null ? 2 : 0;
}

export function richerShift(a: CashShift, b: CashShift): CashShift {
  return shiftRank(a) > shiftRank(b) ? a : b;
}

function unionById<T extends { id: string }>(server: T[], local: T[], pick: (a: T, b: T) => T): T[] {
  const map = new Map<string, T>();
  for (const x of server) if (x?.id) map.set(x.id, x);
  for (const x of local) {
    if (!x?.id) continue;
    const cur = map.get(x.id);
    map.set(x.id, cur ? pick(cur, x) : x);
  }
  return [...map.values()];
}

const esteAparato = <T,>(_server: T, local: T) => local;
const masNuevo = (a: { createdAt: string }, b: { createdAt: string }) => (a.createdAt < b.createdAt ? 1 : -1);

/**
 * Turnos, retiros e historial de stock no viajan por la cinta. Si dos aparatos
 * suben la fotocopia, se suman los dos lados en lugar de ganar uno entero: el
 * celu arrancaba con los turnos de cuando se abrió y, al subir, le borraba al
 * respaldo los cierres de la caja. El aparato adopta lo mismo en su estado,
 * para que la próxima subida sin choque no lo vuelva a perder.
 */
export function backupRecords(
  server: Pick<KioskPayload, "shifts" | "drops" | "movements">,
  local: Pick<KioskPayload, "shifts" | "drops" | "movements">,
): Pick<KioskPayload, "shifts" | "drops" | "movements"> {
  return {
    shifts: unionById(server.shifts ?? [], local.shifts ?? [], richerShift).sort((a, b) =>
      a.openedAt < b.openedAt ? 1 : -1,
    ),
    drops: unionById<CashDrop>(server.drops ?? [], local.drops ?? [], esteAparato).sort(masNuevo),
    movements: unionById<StockMove>(server.movements ?? [], local.movements ?? [], esteAparato).sort(masNuevo),
  };
}

/**
 * El respaldo cuando dos fotocopias chocan: lo de mergePayload (ventas,
 * devoluciones y pedidos sumados; el resto, de este aparato) más turnos,
 * retiros e historial sumados. Ajustes y proveedores ya van por la cinta:
 * una foto vieja no los pisa. Antes de esto, quien sube ya bajó y aplicó
 * los eventos, así que lo de la cinta (productos, stock, planilla, lotes,
 * proveedores, márgenes) ya está al día.
 */
export function mergeBackup(server: KioskPayload, local: KioskPayload): KioskPayload {
  // Ventas viejas y meses ya los cuida mergePayload: no cuenta dos veces lo mismo.
  return prunePayload({ ...mergePayload(server, local), ...backupRecords(server, local) });
}

function remoteHasWork(p: KioskPayload | null | undefined): boolean {
  if (!p) return false;
  if (hasCatalog(p)) return true;
  return (p.orders ?? []).some((o) => o.sent && namedLines(o) > 0);
}

/**
 * Si este aparato puede pisar la fotocopia del local.
 *
 * La pregunta no es cuánto tiene, es **si alguna vez bajó el local**. Un
 * aparato que nunca lo bajó no tiene con qué compararse y pisaría el respaldo
 * de un local que sí tiene datos: ese es el caso que hay que seguir tapando.
 *
 * Tener poco no es lo mismo que no tener nada. Un local sin catálogo igual
 * tiene turnos y retiros de verdad, y con la regla vieja ("sin productos y sin
 * ventas no hay nada que respaldar") su caja no subía nunca — y encima el
 * registro decía "listo".
 *
 * `revConocido` es el rev que el aparato guardó al recibir el local de la nube
 * (`writeBlobRev`, que se escribe en cada camino antes de hidratar). `null` es
 * "todavía no lo recibí".
 */
export function puedeRespaldar(revConocido: number | null | undefined): boolean {
  return revConocido != null;
}

/** El estado vivo gana a una fotocopia guardada: stock, lotes y ticket a medio armar. */
export function preferLiveCopy(live: KioskPayload, snap: KioskPayload | null | undefined): KioskPayload {
  if (hasCatalog(live) || (live.ticket?.length ?? 0) > 0) return live;
  return snap ?? live;
}

/** Pull: never replace a live local with an empty cloud. Count new sent orders. */
export function incomingCopy(
  remote: KioskPayload | null | undefined,
  local: KioskPayload,
): { payload: KioskPayload; newOrders: number; emptyRemote: boolean } {
  if (!remote || !remoteHasWork(remote)) {
    if (hasCatalog(local) || (local.orders ?? []).some((o) => o.sent)) {
      return { payload: local, newOrders: 0, emptyRemote: true };
    }
    return { payload: local, newOrders: 0, emptyRemote: true };
  }
  const payload =
    hasCatalog(local) || (local.ticket?.length ?? 0) > 0 ? mergeBackup(remote, local) : prunePayload(remote);
  const had = new Set((local.orders ?? []).filter((o) => o.sent).map((o) => o.id));
  const newOrders = (payload.orders ?? []).filter(
    (o) => o.sent && namedLines(o) > 0 && !had.has(o.id),
  ).length;
  return { payload, newOrders, emptyRemote: false };
}

export function localHasCopy(p: KioskPayload | null | undefined): boolean {
  return hasCatalog(p);
}

function mergeSheets(a: MonthSheet[], b: MonthSheet[]): MonthSheet[] {
  const map = new Map<string, MonthSheet>();
  for (const s of [...a, ...b]) {
    const cur = map.get(s.ym);
    if (!cur || s.days.length >= cur.days.length) map.set(s.ym, s);
  }
  return [...map.values()].sort((x, y) => y.ym.localeCompare(x.ym)).slice(0, 36);
}
