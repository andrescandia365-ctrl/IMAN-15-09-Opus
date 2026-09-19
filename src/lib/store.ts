import { create } from "zustand";
import { prunePayload } from "./cap";
import { todayKey } from "./format";
import { keepStockAndLots, receiveBody } from "./events";
import { appendSyncLog, lastKnownStore, queueCopy, recordEvent, saveLocalSnapshot } from "./local-db";
import { archiveClosedMonths, emptyBook, cellsOf, currentYm, sameCell, type FacLine } from "./ledger";
import { lineUnits, orderNote, packOf, suggestPacks } from "./pack";
import { nextCadenceDates } from "./supplier-cadence";
import { addLot, consumeFifo } from "./lots";
import { marginPrice, repriceProducts, unitCost } from "./pricing";
import { uid } from "./utils";
import {
  CATEGORY_SUPPLIER,
  SEED_CATEGORIES,
  SEED_PRODUCTS,
  SEED_SETTINGS,
  SEED_SUPPLIERS,
} from "./seed";
import type {
  CashDrop,
  CashShift,
  Category,
  DayBook,
  MonthAgg,
  MonthSheet,
  OrderDraft,
  PayMethod,
  Product,
  Refund,
  Sale,
  Settings,
  StockMove,
  Supplier,
  StaffMember,
  StaffPayout,
  RosterSlot,
  TicketLine,
  ViewId,
  KioskPayload,
} from "./types";
import { beep, speak, speakPrice } from "./voice";

export interface ImanState {
  hydrated: boolean;
  view: ViewId;
  search: string;
  categoryFilter: string | "all";
  selectedId: string | null;
  ticket: TicketLine[];
  payMethod: PayMethod;
  paidInput: string;
  products: Product[];
  categories: Category[];
  sales: Sale[];
  settings: Settings;
  suppliers: Supplier[];
  shifts: CashShift[];
  drops: CashDrop[];
  orders: OrderDraft[];
  movements: StockMove[];
  refunds: Refund[];
  books: DayBook[];
  monthAggs: MonthAgg[];
  monthSheets: MonthSheet[];
  staff: StaffMember[];
  roster: RosterSlot[];
  payouts: StaffPayout[];
  lastSaleId: string | null;
  receiptOpen: boolean;
  deskStoreId: string;

  setHydrated: (v: boolean) => void;
  setView: (v: ViewId) => void;
  setSearch: (q: string) => void;
  setCategoryFilter: (id: string | "all") => void;
  selectProduct: (id: string | null, opts?: { speak?: boolean }) => void;
  addToTicket: (productId: string, qty?: number) => { ok: boolean; error?: string };
  setLineQty: (productId: string, qty: number) => void;
  removeLine: (productId: string) => void;
  clearTicket: () => void;
  replaceTicket: (lines: TicketLine[], extra?: { payMethod?: PayMethod; paidInput?: string }) => void;
  dateLot: (productId: string, expiresAt: string, units: number) => { ok: boolean; error?: string };
  hydrateKiosk: (p: KioskPayload, opts?: { restore?: boolean; keepUi?: boolean }) => void;
  setDeskStoreId: (id: string) => void;
  setPayMethod: (m: PayMethod) => void;
  setPaidInput: (v: string) => void;
  checkout: () => { ok: boolean; error?: string; sale?: Sale };
  closeReceipt: () => void;
  refundCliente: (opts: {
    productId: string;
    units: number;
    paymentMethod: PayMethod;
    saleId?: string;
  }) => { ok: boolean; error?: string };
  refundProveedor: (opts: {
    supplierId: string;
    productId: string;
    packs: number;
    units?: number;
    facLine?: FacLine;
    amount?: number;
  }) => { ok: boolean; error?: string };
  saveProduct: (p: Product) => void;
  deleteProduct: (id: string) => void;
  adjustStock: (id: string, delta: number, reason: string) => void;
  saveSettings: (patch: Partial<Settings>) => void;
  applyCategoryPrices: (categoryId: string) => number;
  setProductPrices: (updates: { id: string; price: number }[]) => number;
  importCatalog: (products: Product[], categories: Category[]) => void;
  openReceipt: (id: string) => void;
  openShift: (opening: number) => { ok: boolean; error?: string };
  closeShift: (
    closing: number,
    extra?: { note?: string; virtualCel?: number; virtualSube?: number; safeCount?: number },
  ) => { ok: boolean; error?: string };
  addDrop: (amount: number, note?: string) => { ok: boolean; error?: string };
  upsertBook: (row: DayBook) => void;
  setLedgerCell: (date: string, rowId: string, value: number) => void;
  saveStaff: (p: StaffMember) => void;
  deleteStaff: (id: string) => void;
  setRoster: (date: string, shiftKey: string, staffId: string) => void;
  payStaff: (opts: {
    staffId: string;
    amount: number;
    kind: StaffPayout["kind"];
    fromCaja: boolean;
    note?: string;
  }) => { ok: boolean; error?: string };
  releaseMonth: (ym: string) => { ok: boolean; error?: string; freed: number };
  generateOrder: (supplierId: string) => OrderDraft | null;
  addOrderLine: (supplierId: string, productId: string, qty?: number, asUnit?: boolean) => void;
  setOrderLineQty: (orderId: string, productId: string, qty: number, asUnit?: boolean) => void;
  markOrderSent: (id: string) => void;
  receiveOrder: (id: string) => void;
  receiveOrderUnits: (
    id: string,
    receipts: { productId: string; units: number; asUnit?: boolean }[],
    remitoPhoto?: string,
  ) => { ok: boolean; error?: string };
  receiveLoose: (supplierId: string, productId: string, qty?: number) => void;
  saveSupplier: (s: Supplier) => void;
  deleteSupplier: (id: string) => void;
  saveCategory: (c: Category) => void;
  deleteCategory: (id: string) => { ok: boolean; error?: string };
  resetDemo: () => void;
  loadExampleCatalog: () => void;
  clearExampleCatalog: () => { products: number; suppliers: number };
  applyOnboarding: (opts: {
    name: string;
    rubro: Settings["rubro"];
    city: string;
    catalog: "example" | "empty";
  }) => void;
  speakPhrase: (text: string) => void;
}

function pushOrderCopy(getState: () => ImanState) {
  const storeId = getState().deskStoreId || lastKnownStore();
  if (!storeId) return;
  const snap = prunePayload(snapshotKiosk(getState()));
  void saveLocalSnapshot(storeId, snap)
    .then(() => queueCopy(storeId, snap))
    .catch(() => {});
}

function hoursAgoIso(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

function upsertBookRow(books: DayBook[], row: DayBook): DayBook[] {
  const i = books.findIndex((b) => b.date === row.date);
  if (i < 0) return [row, ...books];
  const cur = books[i]!;
  const next = books.slice();
  next[i] = {
    ...cur,
    ...row,
    expenses: row.expenses.length ? row.expenses : cur.expenses,
  };
  return next;
}

function seedSales(): Sale[] {
  const pick = (id: string, qty: number) => {
    const p = SEED_PRODUCTS.find((x) => x.id === id)!;
    return { productId: p.id, name: p.name, price: p.price, qty, cost: unitCost(p) ?? undefined };
  };
  const rows: { items: ReturnType<typeof pick>[]; method: PayMethod; h: number }[] = [
    { items: [pick("p6", 1), pick("p14", 2)], method: "efectivo", h: 0.15 },
    { items: [pick("p1", 1)], method: "mercadopago", h: 0.35 },
    { items: [pick("p7", 2), pick("p16", 1)], method: "efectivo", h: 0.6 },
    { items: [pick("p21", 1), pick("p28", 2)], method: "debito", h: 0.9 },
    { items: [pick("p10", 1), pick("p19", 1)], method: "efectivo", h: 1.2 },
    { items: [pick("p13", 3)], method: "mercadopago", h: 1.6 },
    { items: [pick("p5", 4), pick("p35", 1)], method: "efectivo", h: 2.0 },
    { items: [pick("p11", 2)], method: "debito", h: 2.4 },
  ];
  return rows.map((r, i) => {
    const total = r.items.reduce((a, it) => a + it.price * it.qty, 0);
    return {
      id: `seed_sa_${i}`,
      createdAt: hoursAgoIso(r.h),
      paymentMethod: r.method,
      note: r.method === "efectivo" ? "Efectivo" : r.method === "mercadopago" ? "Mercado Pago" : "Débito",
      total,
      paid: r.method === "efectivo" ? total : null,
      items: r.items,
    };
  });
}

function seedShift(opening = SEED_SETTINGS.cashFloat): CashShift {
  return {
    id: uid("sh"),
    status: "open",
    openingCash: opening,
    closingCash: null,
    expectedCash: null,
    salesTotal: null,
    salesCount: null,
    note: null,
    openedAt: new Date().toISOString(),
    closedAt: null,
  };
}

function mergeSettings(raw: Settings): Settings {
  return {
    ...SEED_SETTINGS,
    ...raw,
    phrases: Array.isArray(raw.phrases) ? raw.phrases : [...SEED_SETTINGS.phrases],
    shifts: Array.isArray(raw.shifts) ? raw.shifts : SEED_SETTINGS.shifts.map((s) => ({ ...s })),
    tasks: raw.tasks ?? { ...SEED_SETTINGS.tasks },
    onboarded: typeof raw.onboarded === "boolean" ? raw.onboarded : true,
    rubro: raw.rubro ?? "kiosco",
    city: typeof raw.city === "string" ? raw.city : "",
    ownerPinHash: typeof raw.ownerPinHash === "string" ? raw.ownerPinHash : "",
    printerBaud: typeof raw.printerBaud === "number" ? raw.printerBaud : 9600,
    mpFeePct: typeof raw.mpFeePct === "number" ? raw.mpFeePct : 0.06,
    monthExpenses: Array.isArray(raw.monthExpenses)
      ? raw.monthExpenses
      : SEED_SETTINGS.monthExpenses?.map((e) => ({ ...e })),
    ledgerTints: raw.ledgerTints && typeof raw.ledgerTints === "object" ? raw.ledgerTints : {},
    ledgerLabels: raw.ledgerLabels && typeof raw.ledgerLabels === "object" ? raw.ledgerLabels : {},
  };
}

function emptyBooks(opening: number) {
  return {
    sales: [] as Sale[],
    drops: [] as CashDrop[],
    orders: [] as OrderDraft[],
    movements: [] as StockMove[],
    refunds: [] as Refund[],
    books: [] as DayBook[],
    monthAggs: [] as MonthAgg[],
    monthSheets: [] as MonthSheet[],
    ticket: [] as TicketLine[],
    lastSaleId: null as string | null,
    receiptOpen: false,
    paidInput: "",
    selectedId: null as string | null,
    search: "",
    categoryFilter: "all" as const,
    view: "counter" as ViewId,
    shifts: [seedShift(opening)],
  };
}

function seedState() {
  return {
    view: "counter" as ViewId,
    search: "",
    categoryFilter: "all" as const,
    selectedId: null as string | null,
    ticket: [] as TicketLine[],
    payMethod: "efectivo" as PayMethod,
    paidInput: "",
    products: SEED_PRODUCTS.map((p) => ({ ...p })),
    categories: SEED_CATEGORIES.map((c) => ({ ...c })),
    sales: seedSales(),
    settings: { ...SEED_SETTINGS, phrases: [...SEED_SETTINGS.phrases], shifts: SEED_SETTINGS.shifts.map((s) => ({ ...s })), tasks: { ...SEED_SETTINGS.tasks } },
    suppliers: SEED_SUPPLIERS.map((s) => ({ ...s, days: [...s.days] })),
    shifts: [seedShift()],
    drops: [] as CashDrop[],
    orders: [] as OrderDraft[],
    movements: [] as StockMove[],
    refunds: [] as Refund[],
    books: [] as DayBook[],
    monthAggs: [] as MonthAgg[],
    monthSheets: [] as MonthSheet[],
    staff: [] as StaffMember[],
    roster: [] as RosterSlot[],
    payouts: [] as StaffPayout[],
    lastSaleId: null as string | null,
    receiptOpen: false,
    deskStoreId: "",
  };
}

export const useImanStore = create<ImanState>()((set, get) => ({
      ...seedState(),
      hydrated: false,

      setHydrated: (v) => set({ hydrated: v }),
      setView: (view) => set({ view }),
      setSearch: (search) => set({ search }),
      setCategoryFilter: (categoryFilter) => set({ categoryFilter }),

      selectProduct: (id, opts) => {
        set({ selectedId: id });
        if (!id || opts?.speak === false) return;
        const p = get().products.find((x) => x.id === id);
        if (!p) return;
        const s = get().settings;
        speakPrice(p.name, p.price, {
          enabled: s.voiceEnabled,
          lang: s.voiceLang,
          gender: s.voiceGender,
          rate: s.voiceRate,
        });
      },

      addToTicket: (productId, qty = 1) => {
        const p = get().products.find((x) => x.id === productId);
        if (!p) return { ok: false, error: "Producto no encontrado" };
        if (!p.active) return { ok: false, error: "Producto inactivo" };
        const existing = get().ticket.find((l) => l.productId === productId);
        const nextQty = (existing?.qty ?? 0) + qty;
        if (get().settings.blockZeroStock && p.stock < nextQty) {
          beep(false);
          return { ok: false, error: "Sin stock suficiente" };
        }
        set((st) => {
          const ticket = existing
            ? st.ticket.map((l) => (l.productId === productId ? { ...l, qty: l.qty + qty, price: p.price, name: p.name } : l))
            : [
                ...st.ticket,
                { productId: p.id, name: p.name, barcode: p.barcode, price: p.price, qty },
              ];
          return { ticket, selectedId: p.id, search: "" };
        });
        beep(true);
        const s = get().settings;
        speakPrice(p.name, p.price, {
          enabled: s.voiceEnabled,
          lang: s.voiceLang,
          gender: s.voiceGender,
          rate: s.voiceRate,
        });
        return { ok: true };
      },

      setLineQty: (productId, qty) => {
        if (qty <= 0) {
          set((st) => ({ ticket: st.ticket.filter((l) => l.productId !== productId) }));
          return;
        }
        set((st) => ({
          ticket: st.ticket.map((l) => (l.productId === productId ? { ...l, qty } : l)),
        }));
      },

      removeLine: (productId) =>
        set((st) => ({ ticket: st.ticket.filter((l) => l.productId !== productId) })),

      clearTicket: () => set({ ticket: [], paidInput: "", selectedId: null }),
      replaceTicket: (lines, extra) =>
        set({
          ticket: lines,
          paidInput: extra?.paidInput ?? "",
          payMethod: extra?.payMethod ?? get().payMethod,
          selectedId: lines[0]?.productId ?? null,
        }),

      dateLot: (productId, expiresAt, units) => {
        const st = get();
        const p = st.products.find((x) => x.id === productId);
        if (!p) return { ok: false, error: "No está" };
        const r = addLot(p, expiresAt, units);
        if (!r.ok) return r;
        set({ products: st.products.map((x) => (x.id === productId ? r.product : x)) });
        // Cuánto y para cuándo, con el id del lote: no el producto entero, que
        // arrastraba el stock de este aparato y pisaba las ventas de la caja.
        recordEvent("lot", { productId, lotId: r.lot.id, expiresAt: r.lot.expiresAt, units: r.lot.units });
        return { ok: true };
      },
      setDeskStoreId: (deskStoreId) => set({ deskStoreId }),

      setPayMethod: (payMethod) => set({ payMethod, paidInput: payMethod === "efectivo" ? get().paidInput : "" }),
      setPaidInput: (paidInput) => set({ paidInput }),

      checkout: () => {
        const st = get();
        if (!st.ticket.length) return { ok: false, error: "Carrito vacío" };
        const total = st.ticket.reduce((s, l) => s + l.price * l.qty, 0);
        const paid = st.payMethod === "efectivo" ? Number(st.paidInput) || 0 : total;
        if (st.payMethod === "efectivo" && paid > 0 && paid < total) {
          return { ok: false, error: "El efectivo no cubre el total" };
        }
        const open = st.shifts.find((s) => s.status === "open");
        if (!open) return { ok: false, error: "Abrí la caja para vender" };

        // El costo del momento: si mañana cambia el catálogo, esta venta ya sabe
        // lo que le costó. Sin costo cargado va undefined, nunca 0.
        const costOf = (id: string): number | undefined => {
          const p = st.products.find((x) => x.id === id);
          return p ? (unitCost(p) ?? undefined) : undefined;
        };

        const sale: Sale = {
          id: uid("sa"),
          createdAt: new Date().toISOString(),
          paymentMethod: st.payMethod,
          note:
            st.payMethod === "efectivo" && paid > 0
              ? `Efectivo · Pagó ${paid}`
              : st.payMethod === "mercadopago"
                ? "Mercado Pago"
                : "Débito",
          total,
          paid: st.payMethod === "efectivo" ? paid || total : null,
          items: st.ticket.map((l) => ({
            productId: l.productId,
            name: l.name,
            price: l.price,
            qty: l.qty,
            cost: costOf(l.productId),
          })),
        };

        const stockMap = new Map(st.ticket.map((l) => [l.productId, l.qty]));
        const products = st.products.map((p) => {
          const q = stockMap.get(p.id);
          if (!q) return p;
          return consumeFifo(p, q);
        });
        const movements: StockMove[] = [
          ...st.ticket.map((l) => ({
            id: uid("mv"),
            productId: l.productId,
            productName: l.name,
            delta: -l.qty,
            reason: "venta",
            createdAt: sale.createdAt,
          })),
          ...st.movements,
        ];

        const next: KioskPayload = {
          products,
          categories: st.categories,
          sales: [sale, ...st.sales],
          settings: st.settings,
          suppliers: st.suppliers,
          shifts: st.shifts,
          drops: st.drops,
          orders: st.orders,
          movements,
          refunds: st.refunds,
          ticket: [],
          payMethod: st.payMethod,
          books: st.books,
          monthAggs: st.monthAggs,
          monthSheets: st.monthSheets,
        };
        const pruned = prunePayload(next);
        set({
          sales: pruned.sales,
          products: pruned.products,
          movements: pruned.movements,
          shifts: pruned.shifts,
          drops: pruned.drops,
          orders: pruned.orders,
          books: pruned.books ?? [],
          monthAggs: pruned.monthAggs ?? [],
          monthSheets: pruned.monthSheets ?? st.monthSheets,
          ticket: [],
          paidInput: "",
          lastSaleId: sale.id,
          receiptOpen: true,
          selectedId: null,
        });
        beep(true);
        const s = st.settings;
        speak("Gracias", {
          enabled: s.voiceEnabled,
          lang: s.voiceLang,
          gender: s.voiceGender,
          rate: s.voiceRate,
        });
        recordEvent("sale", sale);
        return { ok: true, sale };
      },

      closeReceipt: () => set({ receiptOpen: false }),
      openReceipt: (id) => set({ lastSaleId: id, receiptOpen: true }),

      refundCliente: ({ productId, units, paymentMethod, saleId }) => {
        const st = get();
        if (!st.shifts.some((s) => s.status === "open")) {
          return { ok: false, error: "Abrí la caja para devolver plata" };
        }
        if (units <= 0) return { ok: false, error: "Cantidad inválida" };
        const p = st.products.find((x) => x.id === productId);
        if (!p) return { ok: false, error: "Producto no encontrado" };
        let price = p.price;
        if (saleId) {
          const sale = st.sales.find((s) => s.id === saleId);
          if (!sale) return { ok: false, error: "Ticket no encontrado" };
          const item = sale.items.find((it) => it.productId === productId);
          if (!item) return { ok: false, error: "Ese producto no está en el ticket" };
          const already = st.refunds
            .filter((r) => r.saleId === saleId && r.productId === productId)
            .reduce((a, r) => a + r.units, 0);
          if (already + units > item.qty) {
            return { ok: false, error: `En el ticket quedan ${item.qty - already} u.` };
          }
          price = item.price;
        }
        const pack = packOf(p);
        const packs = pack > 1 && units % pack === 0 ? units / pack : 0;
        const refund: Refund = {
          id: uid("rf"),
          kind: "cliente",
          createdAt: new Date().toISOString(),
          productId: p.id,
          productName: p.name,
          units,
          packs,
          amount: price * units,
          paymentMethod,
          saleId,
          note: packs ? `Pack x${pack}` : "Unidad",
        };
        set({
          products: st.products.map((x) => (x.id === p.id ? { ...x, stock: x.stock + units } : x)),
          refunds: [refund, ...st.refunds].slice(0, 200),
          movements: [
            {
              id: uid("mv"),
              productId: p.id,
              productName: p.name,
              delta: units,
              reason: "devolución cliente",
              createdAt: refund.createdAt,
            },
            ...st.movements,
          ].slice(0, 200),
        });
        recordEvent("refund", refund);
        return { ok: true };
      },

      refundProveedor: ({ supplierId, productId, packs, units, facLine, amount }) => {
        const st = get();
        const supplier = st.suppliers.find((s) => s.id === supplierId);
        const p = st.products.find((x) => x.id === productId);
        if (!supplier || !p) return { ok: false, error: "Proveedor o producto no encontrado" };
        const pack = packOf(p);
        const qtyUnits = units && units > 0 ? units : packs * pack;
        if (qtyUnits <= 0) return { ok: false, error: "Cantidad inválida" };
        if (p.stock < qtyUnits) return { ok: false, error: `Hay ${p.stock} u. No alcanza para devolver.` };
        const nPacks = pack > 1 ? Math.floor(qtyUnits / pack) : 0;
        const nc = amount && amount > 0 ? amount : null;
        const unit = unitCost(p);
        if (nc == null && unit == null) {
          return {
            ok: false,
            error: "Este producto no tiene costo cargado. Poné el monto de la nota de crédito.",
          };
        }
        const credit = nc ?? unit! * qtyUnits;
        const line: FacLine = facLine ?? "fac_x";
        const date = todayKey();
        const cur = st.books.find((b) => b.date === date) ?? emptyBook(date);
        const cells = cellsOf(cur);
        cells[line] = Math.max(0, (Number(cells[line] ?? 0) || 0) - credit);
        const refund: Refund = {
          id: uid("rf"),
          kind: "proveedor",
          createdAt: new Date().toISOString(),
          productId: p.id,
          productName: p.name,
          units: qtyUnits,
          packs: nPacks,
          amount: credit,
          paymentMethod: "credito",
          supplierId: supplier.id,
          supplierName: supplier.name,
          note: `NC ${line} ${credit}`,
        };
        set({
          products: st.products.map((x) => (x.id === p.id ? { ...x, stock: x.stock - qtyUnits } : x)),
          refunds: [refund, ...st.refunds].slice(0, 200),
          movements: [
            {
              id: uid("mv"),
              productId: p.id,
              productName: p.name,
              delta: -qtyUnits,
              reason: "devolución proveedor",
              createdAt: refund.createdAt,
            },
            ...st.movements,
          ].slice(0, 200),
          books: upsertBookRow(st.books, {
            ...cur,
            date,
            cells,
            facA: cells.fac_a ?? cur.facA,
            facX: cells.fac_x ?? cur.facX,
            cigarrillos: cells.cigarrillos ?? cur.cigarrillos,
          }),
        });
        recordEvent("refund", refund);
        recordEvent("ledger", { date, rowId: line, value: cells[line] });
        return { ok: true };
      },

      saveProduct: (p) => {
        const st = get();
        const cur = st.products.find((x) => x.id === p.id);
        // Del editor se toma el catálogo. Stock y lotes son los del store ahora, no
        // los de la copia que hizo el diálogo al abrirse: si entró una venta en el
        // medio, guardar la devolvía. La corrección a mano del stock viaja aparte,
        // como evento `stock` (ver stockCorrection).
        const next = cur ? keepStockAndLots(cur, p) : p;
        set({
          products: cur ? st.products.map((x) => (x.id === p.id ? next : x)) : [...st.products, next],
        });
        recordEvent("product", next);
      },

      deleteProduct: (id) => {
        set((st) => ({
          products: st.products.filter((p) => p.id !== id),
          ticket: st.ticket.filter((l) => l.productId !== id),
        }));
        recordEvent("product.delete", { id });
      },

      adjustStock: (id, delta, reason) => {
        set((st) => {
          const p = st.products.find((x) => x.id === id);
          if (!p) return st;
          const product = delta < 0 ? consumeFifo(p, -delta) : { ...p, stock: p.stock + delta };
          return {
            products: st.products.map((x) => (x.id === id ? product : x)),
            movements: [
              {
                id: uid("mv"),
                productId: id,
                productName: p.name,
                delta,
                reason,
                createdAt: new Date().toISOString(),
              },
              ...st.movements,
            ].slice(0, 200),
          };
        });
        recordEvent("stock", { productId: id, delta, reason });
      },

      saveSettings: (patch) =>
        set((st) => ({ settings: { ...st.settings, ...patch } })),

      applyCategoryPrices: (categoryId) => {
        const st = get();
        const cat = st.categories.find((c) => c.id === categoryId);
        if (!cat) return 0;
        // Cada producto con la Fac de su proveedor, como el cruce del dueño y la
        // herramienta del encargado. Es la misma cuenta que marca los desalineados.
        const r = repriceProducts(
          st.products,
          (p) => (p.categoryId === categoryId ? marginPrice(p, cat, st.suppliers, st.settings) : null),
          new Date().toISOString(),
        );
        if (!r.changed.length) return 0;
        set({ products: r.products });
        // Uno por producto, como saveProduct: sin esto el celu seguía vendiendo al precio viejo.
        for (const p of r.changed) recordEvent("product", p);
        return r.changed.length;
      },

      setProductPrices: (updates) => {
        if (!updates.length) return 0;
        const map = new Map(updates.map((u) => [u.id, u.price]));
        const r = repriceProducts(get().products, (p) => map.get(p.id) ?? null, new Date().toISOString());
        if (!r.changed.length) return 0;
        set({ products: r.products });
        for (const p of r.changed) recordEvent("product", p);
        return r.changed.length;
      },

      importCatalog: (products, categories) => set({ products, categories }),

      openShift: (opening) => {
        if (get().shifts.some((s) => s.status === "open")) {
          return { ok: false, error: "Ya hay una caja abierta" };
        }
        const shift: CashShift = {
          id: uid("sh"),
          status: "open",
          openingCash: Math.max(0, opening),
          closingCash: null,
          expectedCash: null,
          salesTotal: null,
          salesCount: null,
          note: null,
          openedAt: new Date().toISOString(),
          closedAt: null,
        };
        set((st) => ({ shifts: [shift, ...st.shifts] }));
        return { ok: true };
      },

      closeShift: (closing, extra) => {
        const st = get();
        const open = st.shifts.find((s) => s.status === "open");
        if (!open) return { ok: false, error: "No hay caja abierta" };
        const salesIn = st.sales.filter((s) => s.createdAt >= open.openedAt);
        const efectivo = salesIn
          .filter((s) => s.paymentMethod === "efectivo")
          .reduce((a, s) => a + s.total, 0);
        const drops = st.drops
          .filter((d) => d.shiftId === open.id)
          .reduce((a, d) => a + d.amount, 0);
        const expected = open.openingCash + efectivo - drops;
        const bookDate = open.openedAt.slice(0, 10);
        const virtualCel = extra?.virtualCel ?? 0;
        const virtualSube = extra?.virtualSube ?? 0;
        const safeCount = extra?.safeCount ?? closing;
        set({
          shifts: st.shifts.map((s) =>
            s.id === open.id
              ? {
                  ...s,
                  status: "closed" as const,
                  closingCash: closing,
                  expectedCash: expected,
                  salesTotal: salesIn.reduce((a, x) => a + x.total, 0),
                  salesCount: salesIn.length,
                  note: extra?.note || null,
                  virtualCel,
                  virtualSube,
                  safeCount,
                  closedAt: new Date().toISOString(),
                }
              : s,
          ),
          books: upsertBookRow(st.books, {
            ...(st.books.find((b) => b.date === bookDate) ?? emptyBook(bookDate)),
            date: bookDate,
            safeCount,
            virtualCel,
            virtualSube,
            notes: extra?.note ?? st.books.find((b) => b.date === bookDate)?.notes ?? "",
          }),
        });
        return { ok: true };
      },

      upsertBook: (row) => set((st) => ({ books: upsertBookRow(st.books, row) })),

      setLedgerCell: (date, rowId, value) => {
        // Salir de una celda sin cambiarla no escribe ni manda nada. Recorrer la
        // columna con las flechas reenviaba lo que este aparato tenía y pisaba lo
        // que el dueño había cargado desde el celu.
        if (sameCell(get().books, date, rowId, value)) return;
        set((st) => {
          const cur = st.books.find((b) => b.date === date) ?? emptyBook(date);
          const cells = { ...(cur.cells ?? {}), [rowId]: value };
          return {
            books: upsertBookRow(st.books, {
              ...cur,
              date,
              cells,
              facA: cells.fac_a ?? cur.facA,
              facX: cells.fac_x ?? cur.facX,
              cigarrillos: cells.cigarrillos ?? cur.cigarrillos,
              virtualCel: cells.ventas_virtuales ?? cur.virtualCel,
            }),
          };
        });
        recordEvent("ledger", { date, rowId, value });
      },

      saveStaff: (p) => {
        set((st) => {
          const exists = st.staff.some((x) => x.id === p.id);
          return { staff: exists ? st.staff.map((x) => (x.id === p.id ? p : x)) : [...st.staff, p] };
        });
        recordEvent("staff", { op: "save", member: p });
      },

      deleteStaff: (id) => {
        set((st) => ({
          staff: st.staff.filter((p) => p.id !== id),
          roster: st.roster.filter((r) => r.staffId !== id),
        }));
        recordEvent("staff", { op: "delete", id });
      },

      setRoster: (date, shiftKey, staffId) => {
        set((st) => {
          const rest = st.roster.filter((r) => !(r.date === date && r.shiftKey === shiftKey));
          const roster = staffId ? [...rest, { date, shiftKey, staffId }] : rest;
          return { roster };
        });
        recordEvent("staff", { op: "roster", date, shiftKey, staffId });
      },

      payStaff: ({ staffId, amount, kind, fromCaja, note }) => {
        const st = get();
        const person = st.staff.find((p) => p.id === staffId);
        if (!person) return { ok: false, error: "No está en el equipo" };
        if (!(amount > 0)) return { ok: false, error: "Monto inválido" };
        const pay: StaffPayout = {
          id: uid("py"),
          staffId,
          name: person.name,
          amount,
          kind,
          fromCaja,
          createdAt: new Date().toISOString(),
          note: note?.trim() || "",
        };
        set({ payouts: [pay, ...st.payouts] });
        recordEvent("staff", { op: "pay", pay });
        if (fromCaja) {
          const date = todayKey();
          const cur = get().books.find((b) => b.date === date) ?? emptyBook(date);
          const cells = cellsOf(cur);
          const next = (cells.retiros ?? 0) + amount;
          get().setLedgerCell(date, "retiros", next);
        }
        return { ok: true };
      },

      releaseMonth: (ym) => {
        const st = get();
        if (ym === currentYm()) return { ok: false, error: "El mes en curso no se borra", freed: 0 };
        const before = st.books.length;
        const carry = (() => {
          const d = new Date(`${currentYm()}-01T12:00:00`);
          d.setDate(0);
          return todayKey(d);
        })();
        const books = st.books.filter((b) => !b.date.startsWith(ym) || b.date === carry);
        set({ books });
        return { ok: true, freed: before - books.length };
      },

      addDrop: (amount, note) => {
        const open = get().shifts.find((s) => s.status === "open");
        if (!open) return { ok: false, error: "No hay caja abierta" };
        if (amount <= 0) return { ok: false, error: "Monto inválido" };
        const drop: CashDrop = {
          id: uid("dr"),
          shiftId: open.id,
          amount,
          note: note || "Retiro a caja fuerte",
          createdAt: new Date().toISOString(),
        };
        set((st) => ({ drops: [drop, ...st.drops] }));
        return { ok: true };
      },

      generateOrder: (supplierId) => {
        const st = get();
        const supplier = st.suppliers.find((s) => s.id === supplierId);
        if (!supplier) return null;
        const open = st.orders.find((o) => o.supplierId === supplierId && !o.sent);
        const cats =
          supplier.categoryIds?.length
            ? supplier.categoryIds
            : Object.entries(CATEGORY_SUPPLIER)
                .filter(([, sid]) => sid === supplierId)
                .map(([cid]) => cid);
        const dates = nextCadenceDates(supplier);
        const lines = st.products
          .filter((p) => p.active && cats.includes(p.categoryId) && p.stock <= p.stockMin)
          .map((p) => ({
            productId: p.id,
            name: p.name,
            qty: suggestPacks(p),
            asUnit: packOf(p) <= 1,
          }));
        const lineKey = (l: { productId: string; asUnit?: boolean }) =>
          `${l.productId}:${l.asUnit ? "u" : "p"}`;
        const merged = new Map<string, (typeof lines)[number]>();
        for (const l of open?.lines ?? []) merged.set(lineKey(l), { ...l, asUnit: Boolean(l.asUnit) });
        for (const l of lines) {
          const k = lineKey(l);
          const cur = merged.get(k);
          merged.set(k, cur ? { ...cur, qty: Math.max(cur.qty, l.qty) } : l);
        }
        const nextLines = [...merged.values()];
        const text = orderNote(supplier.name, st.settings.name, nextLines, st.products);
        if (open) {
          const draft = {
            ...open,
            supplierName: supplier.name,
            lines: nextLines,
            text,
            liftAt: open.liftAt || dates.liftAt,
            deliverAt: open.deliverAt || dates.deliverAt,
          };
          set({ orders: st.orders.map((o) => (o.id === open.id ? draft : o)) });
          return draft;
        }
        const draft: OrderDraft = {
          id: uid("or"),
          supplierId,
          supplierName: supplier.name,
          lines: nextLines,
          text,
          createdAt: new Date().toISOString(),
          sent: false,
          received: false,
          liftAt: dates.liftAt,
          deliverAt: dates.deliverAt,
        };
        set({ orders: [draft, ...st.orders].slice(0, 40) });
        return draft;
      },

      addOrderLine: (supplierId, productId, qty = 1, asUnit = false) => {
        const st = get();
        const supplier = st.suppliers.find((s) => s.id === supplierId);
        const p = st.products.find((x) => x.id === productId);
        if (!supplier || !p) return;
        let draft = st.orders.find((o) => o.supplierId === supplierId && !o.sent);
        if (!draft) {
          get().generateOrder(supplierId);
          draft = get().orders.find((o) => o.supplierId === supplierId && !o.sent);
        }
        if (!draft) {
          draft = {
            id: uid("or"),
            supplierId,
            supplierName: supplier.name,
            lines: [],
            text: "",
            createdAt: new Date().toISOString(),
            sent: false,
            received: false,
          };
          set({ orders: [draft, ...st.orders].slice(0, 40) });
        }
        const live = get().orders.find((o) => o.id === draft!.id)!;
        const same = (l: { productId: string; asUnit?: boolean }) =>
          l.productId === productId && Boolean(l.asUnit) === asUnit;
        const existing = live.lines.find(same);
        const lines = existing
          ? live.lines.map((l) => (same(l) ? { ...l, qty: l.qty + qty } : l))
          : [...live.lines, { productId: p.id, name: p.name, qty, asUnit: asUnit || undefined }];
        const text = orderNote(supplier.name, st.settings.name, lines, st.products);
        set((s) => ({ orders: s.orders.map((o) => (o.id === live.id ? { ...o, lines, text } : o)) }));
      },

      setOrderLineQty: (orderId, productId, qty, asUnit = false) =>
        set((st) => ({
          orders: st.orders.map((o) => {
            if (o.id !== orderId) return o;
            const same = (l: { productId: string; asUnit?: boolean }) =>
              l.productId === productId && Boolean(l.asUnit) === asUnit;
            const lines =
              qty <= 0
                ? o.lines.filter((l) => !same(l))
                : o.lines.map((l) => (same(l) ? { ...l, qty } : l));
            return { ...o, lines, text: orderNote(o.supplierName, st.settings.name, lines, st.products) };
          }),
        })),

      markOrderSent: (id) => {
        const st = get();
        const order = st.orders.find((o) => o.id === id);
        if (!order) return;
        const supplier = st.suppliers.find((s) => s.id === order.supplierId);
        const dates = supplier ? nextCadenceDates(supplier) : {};
        const next: OrderDraft = {
          ...order,
          sent: true,
          supplierName: (order.supplierName ?? "").trim() || supplier?.name || "Pedido",
          liftAt: order.liftAt || dates.liftAt,
          deliverAt: order.deliverAt || dates.deliverAt,
          lines: order.lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            qty: l.qty,
            asUnit: l.asUnit,
          })),
        };
        set({
          orders: st.orders.map((o) => (o.id === id ? next : o)),
        });
        recordEvent("order", next);
        const storeId = get().deskStoreId || lastKnownStore();
        if (storeId) {
          const snap = prunePayload(snapshotKiosk(get()));
          void appendSyncLog(storeId, {
            kind: "order",
            title: `Pedido a ${next.supplierName}`,
            detail: "subiendo a la nube",
            status: "pending",
          }).catch(() => {});
          void saveLocalSnapshot(storeId, snap)
            .then(() => queueCopy(storeId, snap))
            .catch(() => {});
        }
      },

      receiveOrder: (id) => {
        const st = get();
        const order = st.orders.find((o) => o.id === id);
        if (!order || order.received) return;
        const qtyMap = new Map<string, number>();
        const nextLines = order.lines.map((l) => {
          const p = st.products.find((x) => x.id === l.productId);
          const units = lineUnits(p, l.qty, l.asUnit);
          qtyMap.set(l.productId, (qtyMap.get(l.productId) ?? 0) + units);
          return { ...l, receivedUnits: units };
        });
        const next: OrderDraft = {
          ...order,
          lines: nextLines,
          received: true,
          sent: true,
          receiptStatus: "complete",
        };
        set({
          products: st.products.map((p) => {
            const q = qtyMap.get(p.id);
            return q ? { ...p, stock: p.stock + q } : p;
          }),
          orders: st.orders.map((o) => (o.id === id ? next : o)),
          movements: [
            ...nextLines.map((l) => ({
              id: uid("mv"),
              productId: l.productId,
              productName: l.name,
              delta: l.receivedUnits ?? 0,
              reason: "recepción",
              createdAt: new Date().toISOString(),
            })),
            ...st.movements,
          ].slice(0, 200),
        });
        recordEvent("receive", {
          ...receiveBody(id, order.lines, st.products),
          receiptStatus: "complete",
          orderLines: nextLines,
        });
        recordEvent("order", next);
        pushOrderCopy(get);
      },

      receiveOrderUnits: (id, receipts, remitoPhoto) => {
        const st = get();
        const order = st.orders.find((o) => o.id === id);
        if (!order || order.received) return { ok: false, error: "Ese pedido ya se recibió" };
        const used = new Set<number>();
        const gotFor = (l: (typeof order.lines)[number]): number => {
          const exact = receipts.findIndex(
            (r, i) =>
              !used.has(i) &&
              r.productId === l.productId &&
              r.asUnit !== undefined &&
              Boolean(r.asUnit) === Boolean(l.asUnit),
          );
          const loose = receipts.findIndex((r, i) => !used.has(i) && r.productId === l.productId);
          const hit = exact >= 0 ? exact : loose;
          if (hit < 0) return 0;
          used.add(hit);
          return Math.max(0, Math.floor(Number(receipts[hit]!.units) || 0));
        };
        const qtyMap = new Map<string, number>();
        let short = false;
        const nextLines = order.lines.map((l) => {
          const p = st.products.find((x) => x.id === l.productId);
          const expected = lineUnits(p, l.qty, l.asUnit);
          const units = gotFor(l);
          if (units < expected) short = true;
          if (units > 0) qtyMap.set(l.productId, (qtyMap.get(l.productId) ?? 0) + units);
          return { ...l, receivedUnits: units };
        });
        const now = new Date().toISOString();
        const moves: StockMove[] = [...qtyMap.entries()].map(([productId, units]) => {
          const p = st.products.find((x) => x.id === productId);
          return {
            id: uid("mv"),
            productId,
            productName: p?.name ?? productId,
            delta: units,
            reason: "recepción",
            createdAt: now,
          };
        });
        const next: OrderDraft = {
          ...order,
          lines: nextLines,
          received: true,
          sent: true,
          remitoPhoto: remitoPhoto || order.remitoPhoto,
          receiptStatus: short ? "short" : "complete",
        };
        set({
          products: st.products.map((p) => {
            const q = qtyMap.get(p.id);
            return q ? { ...p, stock: p.stock + q } : p;
          }),
          orders: st.orders.map((o) => (o.id === id ? next : o)),
          movements: [...moves, ...st.movements].slice(0, 200),
        });
        recordEvent("receive", {
          orderId: id,
          lines: [...qtyMap.entries()].map(([productId, units]) => ({ productId, units })),
          receiptStatus: next.receiptStatus,
          orderLines: nextLines,
        });
        recordEvent("order", next);
        pushOrderCopy(get);
        return { ok: true };
      },

      receiveLoose: (supplierId, productId, qty = 1) => {
        const st = get();
        const supplier = st.suppliers.find((s) => s.id === supplierId);
        const p = st.products.find((x) => x.id === productId);
        if (!supplier || !p) return;
        get().addOrderLine(supplierId, productId, qty);
        const draft = get().orders.find((o) => o.supplierId === supplierId && !o.sent);
        if (draft) get().receiveOrder(draft.id);
      },

      saveCategory: (c) => {
        const st = get();
        const exists = st.categories.some((x) => x.id === c.id);
        const cat = exists ? c : { ...c, sort: c.sort || st.categories.length + 1 };
        set({
          categories: exists
            ? st.categories.map((x) => (x.id === c.id ? cat : x))
            : [...st.categories, cat],
        });
        recordEvent("category", { op: "save", cat });
      },

      deleteCategory: (id) => {
        const st = get();
        if (st.products.some((p) => p.categoryId === id)) {
          return { ok: false, error: "Hay productos en esa categoría" };
        }
        set({
          categories: st.categories.filter((c) => c.id !== id),
          suppliers: st.suppliers.map((s) => ({
            ...s,
            categoryIds: (s.categoryIds ?? []).filter((x) => x !== id),
          })),
        });
        recordEvent("category", { op: "delete", id });
        return { ok: true };
      },

      saveSupplier: (s) =>
        set((st) => {
          const exists = st.suppliers.some((x) => x.id === s.id);
          return {
            suppliers: exists
              ? st.suppliers.map((x) => (x.id === s.id ? s : x))
              : [...st.suppliers, s],
          };
        }),

      deleteSupplier: (id) =>
        set((st) => ({
          suppliers: st.suppliers.filter((s) => s.id !== id),
          orders: st.orders.filter((o) => o.supplierId !== id || o.sent || o.received),
        })),

      resetDemo: () => set({ ...seedState(), hydrated: true }),

      loadExampleCatalog: () =>
        set((st) => ({
          products: SEED_PRODUCTS.map((p) => ({ ...p })),
          categories: SEED_CATEGORIES.map((c) => ({ ...c })),
          suppliers: SEED_SUPPLIERS.map((s) => ({ ...s, days: [...s.days] })),
          ...emptyBooks(st.settings.cashFloat),
        })),

      clearExampleCatalog: () => {
        const st = get();
        const seedIds = new Set(SEED_PRODUCTS.map((p) => p.id));
        const seedCodes = new Set(SEED_PRODUCTS.map((p) => p.barcode));
        const seedSup = new Set(SEED_SUPPLIERS.map((s) => s.id));
        const drop = st.products.filter((p) => seedIds.has(p.id) || seedCodes.has(p.barcode));
        const dropIds = new Set(drop.map((p) => p.id));
        const dropSup = st.suppliers.filter((s) => seedSup.has(s.id));
        set({
          products: st.products.filter((p) => !dropIds.has(p.id)),
          suppliers: st.suppliers.filter((s) => !seedSup.has(s.id)),
          ticket: st.ticket.filter((l) => !dropIds.has(l.productId)),
        });
        for (const p of drop) recordEvent("product.delete", { id: p.id });
        return { products: drop.length, suppliers: dropSup.length };
      },

      applyOnboarding: ({ name, rubro, city, catalog }) =>
        set((st) => {
          const books = emptyBooks(st.settings.cashFloat);
          const named = {
            ...st.settings,
            name: name.trim(),
            rubro,
            city: city.trim(),
            onboarded: true,
          };
          if (catalog === "empty") {
            return {
              ...books,
              products: [],
              settings: named,
            };
          }
          return {
            ...books,
            products: SEED_PRODUCTS.map((p) => ({ ...p })),
            categories: SEED_CATEGORIES.map((c) => ({ ...c })),
            suppliers: SEED_SUPPLIERS.map((s) => ({ ...s, days: [...s.days] })),
            settings: named,
          };
        }),

      hydrateKiosk: (p, opts) => {
        const folded = archiveClosedMonths(
          p.books ?? [],
          p.monthSheets ?? [],
          p.settings?.ledgerLabels,
        );
        const pruned = prunePayload({
          ...p,
          orders: p.orders ?? [],
          books: folded.books,
          monthAggs: p.monthAggs ?? [],
          monthSheets: folded.monthSheets,
        });
        const restore = Boolean(opts?.restore);
        const keepUi = Boolean(opts?.keepUi);
        const shifts = restore
          ? (pruned.shifts ?? []).map((s) =>
              s.status === "open"
                ? { ...s, status: "closed" as const, closedAt: s.closedAt ?? new Date().toISOString() }
                : s,
            )
          : pruned.shifts;
        const cur = keepUi ? get() : null;
        set({
          products: pruned.products,
          categories: pruned.categories,
          sales: pruned.sales,
          settings: mergeSettings(pruned.settings),
          suppliers: pruned.suppliers,
          shifts,
          drops: pruned.drops,
          orders: pruned.orders,
          movements: pruned.movements,
          books: pruned.books ?? [],
          monthAggs: pruned.monthAggs ?? [],
          monthSheets: pruned.monthSheets ?? [],
          refunds: pruned.refunds ?? [],
          staff: pruned.staff ?? [],
          roster: pruned.roster ?? [],
          payouts: pruned.payouts ?? [],
          ticket: keepUi ? (cur?.ticket ?? []) : restore ? [] : (pruned.ticket ?? []),
          payMethod: keepUi ? (cur?.payMethod ?? "efectivo") : (pruned.payMethod ?? "efectivo"),
          hydrated: true,
          view: keepUi ? (cur?.view ?? "counter") : "counter",
          search: keepUi ? (cur?.search ?? "") : "",
          categoryFilter: keepUi ? (cur?.categoryFilter ?? "all") : "all",
          selectedId: keepUi ? (cur?.selectedId ?? null) : null,
          paidInput: keepUi ? (cur?.paidInput ?? "") : "",
          receiptOpen: keepUi ? Boolean(cur?.receiptOpen) : false,
          lastSaleId: keepUi ? (cur?.lastSaleId ?? null) : null,
        });
      },

      speakPhrase: (text) => {
        const s = get().settings;
        speak(text, {
          enabled: true,
          lang: s.voiceLang,
          gender: s.voiceGender,
          rate: s.voiceRate,
        });
      },
}));

export function ticketTotal(ticket: TicketLine[]): number {
  return ticket.reduce((s, l) => s + l.price * l.qty, 0);
}

export function snapshotKiosk(st: ImanState): KioskPayload {
  return {
    products: st.products,
    categories: st.categories,
    sales: st.sales,
    settings: st.settings,
    suppliers: st.suppliers,
    shifts: st.shifts,
    drops: st.drops,
    orders: st.orders,
    movements: st.movements,
    refunds: st.refunds,
    books: st.books,
    monthAggs: st.monthAggs,
    monthSheets: st.monthSheets,
    staff: st.staff,
    roster: st.roster,
    payouts: st.payouts,
    ticket: st.ticket,
    payMethod: st.payMethod,
  };
}

export function useOpenShift() {
  return useImanStore((s) => s.shifts.find((x) => x.status === "open") ?? null);
}

export function computeCash(st: {
  shifts: CashShift[];
  sales: Sale[];
  drops: CashDrop[];
  refunds: Refund[];
  cashThreshold: number;
}) {
  const open = st.shifts.find((s) => s.status === "open") ?? null;
  if (!open) {
    return {
      open: null as CashShift | null,
      salesTotal: 0,
      salesCount: 0,
      efectivo: 0,
      mp: 0,
      debito: 0,
      drops: 0,
      refunds: 0,
      cajaChica: 0,
      over: false,
      threshold: st.cashThreshold,
    };
  }
  const sales = st.sales.filter((s) => s.createdAt >= open.openedAt);
  const clientRf = st.refunds.filter((r) => r.kind === "cliente" && r.createdAt >= open.openedAt);
  const efectivo = sales.filter((s) => s.paymentMethod === "efectivo").reduce((a, s) => a + s.total, 0);
  const mp = sales.filter((s) => s.paymentMethod === "mercadopago").reduce((a, s) => a + s.total, 0);
  const debito = sales.filter((s) => s.paymentMethod === "debito").reduce((a, s) => a + s.total, 0);
  const rfEf = clientRf.filter((r) => r.paymentMethod === "efectivo").reduce((a, r) => a + r.amount, 0);
  const rfMp = clientRf.filter((r) => r.paymentMethod === "mercadopago").reduce((a, r) => a + r.amount, 0);
  const rfDeb = clientRf.filter((r) => r.paymentMethod === "debito").reduce((a, r) => a + r.amount, 0);
  const drops = st.drops.filter((d) => d.shiftId === open.id).reduce((a, d) => a + d.amount, 0);
  const cajaChica = Number(open.openingCash) + efectivo - drops - rfEf;
  return {
    open,
    salesTotal: efectivo + mp + debito - rfEf - rfMp - rfDeb,
    salesCount: sales.length,
    efectivo: efectivo - rfEf,
    mp: mp - rfMp,
    debito: debito - rfDeb,
    drops,
    refunds: rfEf + rfMp + rfDeb,
    cajaChica,
    over: cajaChica >= st.cashThreshold,
    threshold: st.cashThreshold,
  };
}

export function useCashSnapshot() {
  const shifts = useImanStore((s) => s.shifts);
  const sales = useImanStore((s) => s.sales);
  const drops = useImanStore((s) => s.drops);
  const refunds = useImanStore((s) => s.refunds);
  const cashThreshold = useImanStore((s) => s.settings.cashThreshold);
  return computeCash({ shifts, sales, drops, refunds, cashThreshold });
}

