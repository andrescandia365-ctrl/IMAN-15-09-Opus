import { emptyBook, cellsOf, adoptLedgerSettings, takeMonthExpenses, depositLedgerAmounts } from "./ledger.ts";
import { isDeleted, mergeDeleted } from "./deleted.ts";
import { consumeFifo, insertLot, lotsOf } from "./lots.ts";
import { packOf } from "./pack.ts";
import type {
  CashDrop,
  CashShift,
  Category,
  DayBook,
  KioskPayload,
  OrderDraft,
  Product,
  Refund,
  Sale,
  Settings,
  StaffMember,
  StaffPayout,
  RosterSlot,
  Supplier,
} from "./types";
import { richerOrder } from "./cap.ts";
import { cubierto } from "./plegado.ts";

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type ImanEvent = {
  id: string;
  at: string;
  deviceId: string;
  storeId: string;
  type:
    | "sale"
    | "stock"
    | "ledger"
    | "product"
    | "product.delete"
    | "refund"
    | "receive"
    | "order"
    | "staff"
    | "category"
    | "lot"
    | "supplier"
    | "settings"
    | "price"
    | "shift"
    | "drop"
    | "markup";
  body: Json;
  acked?: boolean;
};

/**
 * El parche que viaja en un evento `settings`. El PIN y el logo solo salen
 * si este toque los cambió: no se mandan en cada redondeo o margen.
 */
export function settingsEventPatch(patch: Partial<Settings>, prev?: Partial<Settings>): Partial<Settings> {
  const body: Partial<Settings> = {};
  for (const key of Object.keys(patch) as (keyof Settings)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    if (prev && (key === "ownerPinHash" || key === "storeLogo") && value === prev[key]) continue;
    (body as Record<string, unknown>)[key] = value;
  }
  return body;
}

/**
 * El margen de un rubro: dice qué cambió, no cómo quedó la lista entera.
 * Antes los márgenes viajaban en `settings` como la lista completa del
 * aparato que tocaba uno, y un aparato con la lista vieja pisaba los márgenes
 * que otro había cambiado en otros rubros. `value: null` = sin margen propio.
 * Tipo nuevo: un aparato sin actualizar cae en el `default` y lo ignora.
 */
export type MarkupBody = { categoryId: string; fac: "X" | "A"; value: number | null };

const MAPA_FAC = { X: "priceMarkups", A: "priceMarkupsA" } as const;
export const MAPAS_DE_MARGEN = ["priceMarkups", "priceMarkupsA"] as const;

export function applyMarkup(settings: Settings, b: MarkupBody): Settings {
  const key = MAPA_FAC[b.fac];
  const next = { ...(settings[key] ?? {}) };
  if (b.value == null) delete next[b.categoryId];
  else next[b.categoryId] = b.value;
  return { ...settings, [key]: next };
}

/** Los rubros que un parche de ajustes cambia de margen: uno por rubro y Fac. */
export function markupChanges(prev: Partial<Settings>, patch: Partial<Settings>): MarkupBody[] {
  const out: MarkupBody[] = [];
  for (const fac of ["X", "A"] as const) {
    const key = MAPA_FAC[fac];
    const nuevo = patch[key];
    if (!nuevo) continue;
    const viejo = prev[key] ?? {};
    for (const id of new Set([...Object.keys(viejo), ...Object.keys(nuevo)])) {
      const v = nuevo[id] ?? null;
      if (v !== (viejo[id] ?? null)) out.push({ categoryId: id, fac, value: v });
    }
  }
  return out;
}

/**
 * Un `settings` de un aparato sin actualizar todavía trae la lista entera de
 * márgenes. Esa lista es lo que ese aparato tenía, no lo que cambió: aplicarla
 * entera pisaría lo que otros cambiaron por `markup`. Solo se toman los rubros
 * que este aparato no tiene (un rubro nuevo llega con su margen); los demás
 * se dejan como están.
 */
function margenesDeAparatoViejo(local: Settings, patch: Partial<Settings>): Partial<Settings> {
  const out: Partial<Settings> = {};
  for (const key of MAPAS_DE_MARGEN) {
    const llega = patch[key];
    if (!llega) continue;
    const tengo = local[key] ?? {};
    const faltan = Object.fromEntries(Object.entries(llega).filter(([id]) => !(id in tengo)));
    if (Object.keys(faltan).length) out[key] = { ...tengo, ...faltan };
  }
  return out;
}

/** Catálogo: no es stock ni lotes. El update lleva la ficha completa, no un diff. */
const CATALOG_KEYS = [
  "name",
  "barcode",
  "shortCode",
  "price",
  "cost",
  "stockMin",
  "packQty",
  "packBarcode",
  "categoryId",
  "active",
  "expiresAt",
  "priceUpdatedAt",
  "onOffer",
  "priceA",
] as const;

const MONEY_KEYS = ["price", "cost", "priceUpdatedAt"] as const;

function catalogEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null && b == null) return true;
  return false;
}

function jsonVal(v: unknown): Json {
  return (v === undefined ? null : v) as Json;
}

/**
 * Lo que viaja en un evento `product`. Alta: el producto entero, con stock
 * inicial y lots []. Update: ficha completa de catálogo, sin stock ni lots.
 * Achicar el body de un tipo que el aparato viejo ya entiende le borra los
 * campos que faltan: por eso el update no es un diff.
 */
export function productEventBody(prev: Product | undefined, next: Product): { [key: string]: Json } {
  if (!prev) {
    return { ...(next as unknown as Record<string, Json>), lots: (next.lots ?? []) as unknown as Json };
  }
  const body: { [key: string]: Json } = { id: next.id };
  for (const key of CATALOG_KEYS) body[key] = jsonVal(next[key]);
  return body;
}

/**
 * Parche de plata. Solo las claves que cambiaron. Si también cambió la ficha,
 * no es un `price`: va por `product` con la ficha completa.
 */
export function priceEventBody(prev: Product, next: Product): { [key: string]: Json } | null {
  for (const key of CATALOG_KEYS) {
    if ((MONEY_KEYS as readonly string[]).includes(key)) continue;
    if (!catalogEqual(prev[key], next[key])) return null;
  }
  const body: { [key: string]: Json } = { id: next.id };
  for (const key of MONEY_KEYS) {
    if (catalogEqual(prev[key], next[key])) continue;
    body[key] = jsonVal(next[key]);
  }
  return Object.keys(body).length > 1 ? body : null;
}

/** Qué evento manda saveProduct / alinear / el cruce del dueño. */
export function catalogSaveEvent(
  prev: Product | undefined,
  next: Product,
): { type: "product" | "price"; body: { [key: string]: Json } } | null {
  if (!prev) return { type: "product", body: productEventBody(undefined, next) };
  const plata = priceEventBody(prev, next);
  if (plata) return { type: "price", body: plata };
  const ficha = CATALOG_KEYS.some((key) => !catalogEqual(prev[key], next[key]));
  if (!ficha) return null;
  return { type: "product", body: productEventBody(prev, next) };
}

/**
 * Un `product` trae el catálogo. Stock y lotes se mueven solo con eventos de
 * cantidad (sale, stock, refund, receive, lot): si el producto ya está, se
 * quedan los de este aparato. Antes cualquier `product` (aplicar precios,
 * marcar oferta, fechar) arrastraba el stock de quien lo mandó y pisaba las
 * ventas que ese aparato todavía no había visto. La fecha también se queda
 * cuando sale de los lotes; si ninguno de los dos tiene lotes, es la fecha
 * del producto y viaja como catálogo.
 *
 * Dos toques (nombre vs costo) no se pisan: cada campo que viene en el body
 * se aplica; el que no viene se queda. Stock nunca entra en ese merge.
 */
export function keepStockAndLots(local: Product, incoming: Product): Product {
  return mergeProductCatalog(local, incoming);
}

function mergeProductCatalog(local: Product, incoming: Partial<Product>): Product {
  const next: Product = { ...local };
  for (const key of CATALOG_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
    (next as unknown as Record<string, unknown>)[key] = (incoming as Record<string, unknown>)[key];
  }
  next.id = local.id;
  next.stock = local.stock;
  next.lots = local.lots;
  const fechaDeLotes = lotsOf(local).length > 0 || lotsOf(incoming).length > 0;
  if (fechaDeLotes) next.expiresAt = local.expiresAt;
  return next;
}

/**
 * Cuánto corrigió a mano el campo Stock del editor. Si nadie lo tocó da 0,
 * aunque una venta haya movido el stock con el diálogo abierto: comparar con
 * el stock de ahora devolvería esa venta. Si lo tocaron, la diferencia es
 * contra el stock de ahora, así el número que quedó escrito es el que queda.
 */
export function stockCorrection(alAbrir: number | null, escrito: number, ahora: number): number {
  if (alAbrir == null || escrito === alAbrir) return 0;
  return escrito - ahora;
}

/** Lo que el cierre de caja escribe en la fila del día. La fecha viaja hecha. */
export type ShiftBookPatch = {
  date: string;
  safeCount?: number;
  virtualCel?: number;
  virtualSube?: number;
  notes?: string;
};

function upsertBook(books: DayBook[], row: DayBook): DayBook[] {
  const i = books.findIndex((b) => b.date === row.date);
  if (i < 0) return [row, ...books];
  const next = books.slice();
  next[i] = { ...books[i]!, ...row };
  return next;
}

export function applyEvent(payload: KioskPayload, ev: ImanEvent): KioskPayload {
  switch (ev.type) {
    case "sale": {
      const sale = ev.body as unknown as Sale;
      if (!sale?.id || payload.sales.some((s) => s.id === sale.id)) return payload;
      const qty = new Map(sale.items.map((it) => [it.productId, it.qty]));
      // Si el resumen del mes ya la tiene (llegó tarde, después de plegarse),
      // a la lista no entra: contaría dos veces. El stock se mueve igual.
      const yaPlegada = cubierto(payload.monthMark, sale);
      return {
        ...payload,
        sales: yaPlegada ? payload.sales : [sale, ...payload.sales],
        // La misma cuenta que hizo checkout en la caja: descuenta stock y lotes
        // que ya existían en ev.at. El evento no manda el array de lotes.
        products: payload.products.map((p) => {
          const q = qty.get(p.id);
          return q ? consumeFifo(p, q, ev.at) : p;
        }),
      };
    }
    case "stock": {
      const b = ev.body as { productId: string; delta: number; reason?: string };
      if (!b?.productId || !b.delta) return payload;
      // Igual que adjustStock: para abajo se come los lotes, para arriba es stock sin fecha.
      return {
        ...payload,
        products: payload.products.map((p) =>
          p.id !== b.productId
            ? p
            : b.delta < 0
              ? consumeFifo(p, -b.delta, ev.at)
              : { ...p, stock: p.stock + b.delta },
        ),
      };
    }
    case "ledger": {
      const b = ev.body as { date: string; rowId: string; value: number };
      if (!b?.date || !b.rowId) return payload;
      const cur = payload.books?.find((x) => x.date === b.date) ?? emptyBook(b.date);
      const cells = { ...cellsOf(cur), [b.rowId]: b.value };
      return {
        ...payload,
        books: upsertBook(payload.books ?? [], {
          ...cur,
          date: b.date,
          cells,
          facA: cells.fac_a ?? cur.facA,
          facX: cells.fac_x ?? cur.facX,
          cigarrillos: cells.cigarrillos ?? cur.cigarrillos,
        }),
      };
    }
    case "product": {
      const p = ev.body as unknown as Product;
      if (!p?.id) return payload;
      const exists = payload.products.some((x) => x.id === p.id);
      // Un borrado no se revive: el evento llegó tarde (un cambio de precio de
      // otro aparato, un editor que se abrió antes del borrado).
      if (!exists && isDeleted(payload.deletedProducts, p.id)) return payload;
      // Un alta se toma entera, con su stock inicial; uno que ya está solo
      // cambia el catálogo (el body nuevo no manda stock/lots; el viejo se ignora).
      return {
        ...payload,
        products: exists
          ? payload.products.map((x) => (x.id === p.id ? mergeProductCatalog(x, p) : x))
          : [...payload.products, p],
      };
    }
    case "price": {
      const b = ev.body as {
        id?: string;
        price?: number;
        cost?: number | null;
        priceUpdatedAt?: string;
      };
      if (!b?.id) return payload;
      // No da de alta ni revive: si no está en el catálogo, no se toca.
      if (!payload.products.some((x) => x.id === b.id)) return payload;
      return {
        ...payload,
        products: payload.products.map((p) => {
          if (p.id !== b.id) return p;
          const next = { ...p };
          if (Object.prototype.hasOwnProperty.call(b, "price") && typeof b.price === "number") next.price = b.price;
          if (Object.prototype.hasOwnProperty.call(b, "cost")) next.cost = b.cost ?? null;
          if (Object.prototype.hasOwnProperty.call(b, "priceUpdatedAt") && typeof b.priceUpdatedAt === "string") {
            next.priceUpdatedAt = b.priceUpdatedAt;
          }
          return next;
        }),
      };
    }
    case "lot": {
      const b = ev.body as { productId?: string; lotId?: string; expiresAt?: string; units?: number };
      const units = Math.floor(Number(b?.units) || 0);
      if (!b?.productId || !b.lotId || !b.expiresAt || units <= 0) return payload;
      const lot = { id: b.lotId, expiresAt: b.expiresAt, units, createdAt: ev.at };
      return {
        ...payload,
        products: payload.products.map((p) => (p.id === b.productId ? insertLot(p, lot) : p)),
      };
    }
    case "product.delete": {
      const id = (ev.body as { id: string })?.id;
      if (!id) return payload;
      const name = payload.products.find((p) => p.id === id)?.name;
      return {
        ...payload,
        products: payload.products.filter((p) => p.id !== id),
        deletedProducts: mergeDeleted(payload.deletedProducts, [
          { id, at: ev.at, device: ev.deviceId, ...(name ? { name } : {}) },
        ]),
      };
    }
    case "refund": {
      const r = ev.body as unknown as Refund;
      if (!r?.id || (payload.refunds ?? []).some((x) => x.id === r.id)) return payload;
      const yaPlegada = r.kind === "cliente" && cubierto(payload.monthMark, r);
      return {
        ...payload,
        refunds: yaPlegada ? (payload.refunds ?? []) : [r, ...(payload.refunds ?? [])],
        // Igual que en el origen: lo del cliente vuelve sin fecha; lo que va al
        // proveedor sale de los lotes, como una venta.
        products: payload.products.map((p) =>
          p.id !== r.productId
            ? p
            : r.kind === "cliente"
              ? { ...p, stock: p.stock + r.units }
              : consumeFifo(p, r.units, ev.at),
        ),
      };
    }
    case "order": {
      const o = ev.body as unknown as OrderDraft;
      if (!o?.id) return payload;
      const cur = payload.orders.find((x) => x.id === o.id);
      if (cur?.received) return payload;
      const next = cur ? richerOrder(cur, o) : o;
      const orders = cur
        ? payload.orders.map((x) => (x.id === o.id ? next : x))
        : [next, ...payload.orders];
      return { ...payload, orders };
    }
    case "receive": {
      const b = ev.body as unknown as {
        orderId: string;
        lines: { productId: string; units: number }[];
        receiptStatus?: "complete" | "short";
        orderLines?: OrderDraft["lines"];
      };
      if (!b?.orderId) return payload;
      const order = payload.orders.find((o) => o.id === b.orderId);
      if (order?.received) return payload;
      const qty = new Map((b.lines ?? []).map((l) => [l.productId, l.units]));
      return {
        ...payload,
        products: payload.products.map((p) => {
          const u = qty.get(p.id);
          return u ? { ...p, stock: p.stock + u } : p;
        }),
        orders: payload.orders.map((o) =>
          o.id === b.orderId
            ? {
                ...o,
                received: true,
                sent: true,
                receiptStatus: b.receiptStatus ?? o.receiptStatus,
                lines: b.orderLines ?? o.lines,
              }
            : o,
        ),
      };
    }
    case "staff": {
      const b = ev.body as {
        op?: string;
        member?: StaffMember;
        id?: string;
        date?: string;
        shiftKey?: string;
        staffId?: string;
        pay?: StaffPayout;
      };
      if (b.op === "save" && b.member?.id) {
        const staff = payload.staff ?? [];
        const exists = staff.some((x) => x.id === b.member!.id);
        return {
          ...payload,
          staff: exists ? staff.map((x) => (x.id === b.member!.id ? b.member! : x)) : [...staff, b.member],
        };
      }
      if (b.op === "delete" && b.id) {
        return {
          ...payload,
          staff: (payload.staff ?? []).filter((p) => p.id !== b.id),
          roster: (payload.roster ?? []).filter((r) => r.staffId !== b.id),
        };
      }
      if (b.op === "roster" && b.date && b.shiftKey) {
        const rest = (payload.roster ?? []).filter((r) => !(r.date === b.date && r.shiftKey === b.shiftKey));
        const roster: RosterSlot[] = b.staffId ? [...rest, { date: b.date, shiftKey: b.shiftKey, staffId: b.staffId }] : rest;
        return { ...payload, roster };
      }
      if (b.op === "pay" && b.pay?.id) {
        const payouts = payload.payouts ?? [];
        if (payouts.some((p) => p.id === b.pay!.id)) return payload;
        return { ...payload, payouts: [b.pay, ...payouts] };
      }
      return payload;
    }
    case "category": {
      const b = ev.body as { op?: string; cat?: Category; id?: string };
      const cat = b.cat;
      if (b.op === "save" && cat?.id) {
        const exists = payload.categories.some((c) => c.id === cat.id);
        return {
          ...payload,
          categories: exists
            ? payload.categories.map((c) => (c.id === cat.id ? cat : c))
            : [...payload.categories, cat],
        };
      }
      if (b.op === "delete" && b.id) {
        // Igual que `deleteCategory` en el store: la categoría también sale de
        // los proveedores que la tenían asignada.
        return {
          ...payload,
          categories: payload.categories.filter((c) => c.id !== b.id),
          suppliers: payload.suppliers.map((s) => ({
            ...s,
            categoryIds: (s.categoryIds ?? []).filter((x) => x !== b.id),
          })),
        };
      }
      return payload;
    }
    case "supplier": {
      const b = ev.body as { op?: string; supplier?: Supplier; id?: string };
      const s = b.supplier;
      if (b.op === "save" && s?.id) {
        const exists = payload.suppliers.some((x) => x.id === s.id);
        return {
          ...payload,
          suppliers: exists
            ? payload.suppliers.map((x) => (x.id === s.id ? s : x))
            : [...payload.suppliers, s],
        };
      }
      if (b.op === "delete" && b.id) {
        if (!payload.suppliers.some((x) => x.id === b.id)) return payload;
        // Igual que `deleteSupplier` en el store: los pedidos no mandados de
        // ese proveedor también se van.
        return {
          ...payload,
          suppliers: payload.suppliers.filter((x) => x.id !== b.id),
          orders: payload.orders.filter((o) => o.supplierId !== b.id || o.sent || o.received),
        };
      }
      return payload;
    }
    case "settings": {
      const raw = ev.body;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return payload;
      const patch = settingsEventPatch(raw as Partial<Settings>);
      if (!Object.keys(patch).length) return payload;
      const margenes = margenesDeAparatoViejo(payload.settings, patch);
      for (const key of MAPAS_DE_MARGEN) delete patch[key];
      Object.assign(patch, margenes);
      if (!Object.keys(patch).length) return payload;
      const merged = { ...payload.settings, ...patch };
      const shouldAdopt =
        "ledgerRows" in patch ||
        "ledgerTags" in patch ||
        "monthExpenses" in patch ||
        (Array.isArray(merged.monthExpenses) && merged.monthExpenses.length > 0);
      if (!shouldAdopt) return { ...payload, settings: merged };
      const taken = takeMonthExpenses(merged);
      return {
        ...payload,
        settings: adoptLedgerSettings(merged),
        books: depositLedgerAmounts(payload.books ?? [], taken.deposits),
      };
    }
    case "shift": {
      // La caja la lleva un aparato solo (invariante 4): no hay dos turnos que
      // juntar, alcanza con que sobrevivan al borrado de datos de Chrome. El
      // cierre manda el turno entero, así un aparato que no vio la apertura
      // igual queda con el turno completo.
      const b = ev.body as { op?: string; shift?: CashShift; book?: ShiftBookPatch };
      const shift = b.shift;
      if (!shift?.id) return payload;
      const shifts = payload.shifts ?? [];
      const exists = shifts.some((s) => s.id === shift.id);
      if (b.op === "open") {
        // El mismo evento dos veces no abre dos turnos.
        if (exists) return payload;
        return { ...payload, shifts: [shift, ...shifts] };
      }
      if (b.op !== "close") return payload;
      const next = exists ? shifts.map((s) => (s.id === shift.id ? shift : s)) : [shift, ...shifts];
      const cierre = b.book;
      if (!cierre?.date) return { ...payload, shifts: next };
      // Lo mismo que escribe closeShift en la planilla. La fecha viene en el
      // body, calculada con el día LOCAL de quien cerró (invariante 11): acá no
      // se vuelve a deducir de la hora.
      const cur = (payload.books ?? []).find((x) => x.date === cierre.date) ?? emptyBook(cierre.date);
      return {
        ...payload,
        shifts: next,
        books: upsertBook(payload.books ?? [], {
          ...cur,
          date: cierre.date,
          safeCount: cierre.safeCount ?? cur.safeCount,
          virtualCel: cierre.virtualCel ?? cur.virtualCel,
          virtualSube: cierre.virtualSube ?? cur.virtualSube,
          notes: cierre.notes ?? cur.notes,
        }),
      };
    }
    case "markup": {
      const b = ev.body as Partial<MarkupBody> | null;
      if (!b?.categoryId || (b.fac !== "X" && b.fac !== "A")) return payload;
      const value = typeof b.value === "number" && Number.isFinite(b.value) && b.value > 0 ? b.value : null;
      return { ...payload, settings: applyMarkup(payload.settings, { categoryId: b.categoryId, fac: b.fac, value }) };
    }
    case "drop": {
      const d = ev.body as unknown as CashDrop;
      if (!d?.id || (payload.drops ?? []).some((x) => x.id === d.id)) return payload;
      return { ...payload, drops: [d, ...(payload.drops ?? [])] };
    }
    default:
      return payload;
  }
}

export function applyEvents(payload: KioskPayload, events: ImanEvent[]): KioskPayload {
  return events.reduce(applyEvent, payload);
}

/**
 * Lo que syncNow escribe al store después de aplicar los eventos de otro
 * aparato. Una clave que falte acá se aplica y se tira: le pasó a categories,
 * que bajaba el renombre y no lo guardaba nunca, y a settings, que perdía
 * márgenes y redondeo. suppliers ya iba: el borrado de un rubro también los
 * limpia. shifts y drops entraron con los eventos de caja: sin esto, una PC
 * que se recupera baja los turnos de la cinta y no los guarda.
 */
export function pulledPatch(next: KioskPayload) {
  return {
    products: next.products,
    categories: next.categories,
    suppliers: next.suppliers,
    settings: next.settings,
    sales: next.sales,
    shifts: next.shifts ?? [],
    drops: next.drops ?? [],
    books: next.books ?? [],
    refunds: next.refunds ?? [],
    orders: next.orders,
    movements: next.movements,
    monthAggs: next.monthAggs ?? [],
    monthMark: next.monthMark,
    monthSheets: next.monthSheets ?? [],
    staff: next.staff ?? [],
    roster: next.roster ?? [],
    payouts: next.payouts ?? [],
    deletedProducts: next.deletedProducts ?? [],
  };
}

export function receiveBody(
  orderId: string,
  lines: { productId: string; qty: number; asUnit?: boolean }[],
  products: Product[],
) {
  return {
    orderId,
    lines: lines.map((l) => {
      const p = products.find((x) => x.id === l.productId);
      return { productId: l.productId, units: l.asUnit ? l.qty : l.qty * packOf(p) };
    }),
  };
}
