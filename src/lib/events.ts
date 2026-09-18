import { emptyBook, cellsOf } from "./ledger.ts";
import { consumeFifo, insertLot, lotsOf } from "./lots.ts";
import { packOf } from "./pack.ts";
import type {
  Category,
  DayBook,
  KioskPayload,
  OrderDraft,
  Product,
  Refund,
  Sale,
  StaffMember,
  StaffPayout,
  RosterSlot,
} from "./types";
import { richerOrder } from "./cap.ts";

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
    | "lot";
  body: Json;
  acked?: boolean;
};

/**
 * Un `product` trae el catálogo. Stock y lotes se mueven solo con eventos de
 * cantidad (sale, stock, refund, receive, lot): si el producto ya está, se
 * quedan los de este aparato. Antes cualquier `product` (aplicar precios,
 * marcar oferta, fechar) arrastraba el stock de quien lo mandó y pisaba las
 * ventas que ese aparato todavía no había visto. La fecha también se queda
 * cuando sale de los lotes; si ninguno de los dos tiene lotes, es la fecha
 * del producto y viaja como catálogo.
 */
export function keepStockAndLots(local: Product, incoming: Product): Product {
  const fechaDeLotes = lotsOf(local).length > 0 || lotsOf(incoming).length > 0;
  return {
    ...incoming,
    stock: local.stock,
    lots: local.lots,
    expiresAt: fechaDeLotes ? local.expiresAt : incoming.expiresAt,
  };
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
      return {
        ...payload,
        sales: [sale, ...payload.sales],
        // La misma cuenta que hizo checkout en la caja: descuenta stock y lotes.
        products: payload.products.map((p) => {
          const q = qty.get(p.id);
          return q ? consumeFifo(p, q) : p;
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
          p.id !== b.productId ? p : b.delta < 0 ? consumeFifo(p, -b.delta) : { ...p, stock: p.stock + b.delta },
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
      // Un alta se toma entera, con su stock inicial; uno que ya está solo cambia el catálogo.
      return {
        ...payload,
        products: exists
          ? payload.products.map((x) => (x.id === p.id ? keepStockAndLots(x, p) : x))
          : [...payload.products, p],
      };
    }
    case "lot": {
      const b = ev.body as { productId?: string; lotId?: string; expiresAt?: string; units?: number };
      const units = Math.floor(Number(b?.units) || 0);
      if (!b?.productId || !b.lotId || !b.expiresAt || units <= 0) return payload;
      const lot = { id: b.lotId, expiresAt: b.expiresAt, units };
      return {
        ...payload,
        products: payload.products.map((p) => (p.id === b.productId ? insertLot(p, lot) : p)),
      };
    }
    case "product.delete": {
      const id = (ev.body as { id: string })?.id;
      if (!id) return payload;
      return { ...payload, products: payload.products.filter((p) => p.id !== id) };
    }
    case "refund": {
      const r = ev.body as unknown as Refund;
      if (!r?.id || (payload.refunds ?? []).some((x) => x.id === r.id)) return payload;
      const sign = r.kind === "cliente" ? 1 : -1;
      return {
        ...payload,
        refunds: [r, ...(payload.refunds ?? [])],
        products: payload.products.map((p) =>
          p.id === r.productId ? { ...p, stock: Math.max(0, p.stock + sign * r.units) } : p,
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
 * que bajaba el renombre y no lo guardaba nunca.
 */
export function pulledPatch(next: KioskPayload) {
  return {
    products: next.products,
    categories: next.categories,
    sales: next.sales,
    books: next.books ?? [],
    refunds: next.refunds ?? [],
    orders: next.orders,
    movements: next.movements,
    monthAggs: next.monthAggs ?? [],
    monthSheets: next.monthSheets ?? [],
    staff: next.staff ?? [],
    roster: next.roster ?? [],
    payouts: next.payouts ?? [],
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
