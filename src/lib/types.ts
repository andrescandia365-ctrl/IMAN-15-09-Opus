export type PayMethod = "efectivo" | "mercadopago" | "debito";
export type ViewId = "taller" | "counter" | "inventory" | "orders" | "cash" | "expire" | "reports" | "settings";
export type ThemeMode = "dark" | "light";
export type KioskRubro = "kiosco" | "almacen" | "despensa" | "maxikiosco" | "otro";

export interface Category {
  id: string;
  name: string;
  sort: number;
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  /** Código corto de góndola (acepta 0). No pisa el EAN. */
  shortCode?: string;
  price: number;
  cost: number | null;
  stock: number;
  stockMin: number;
  packQty?: number;
  packBarcode?: string;
  categoryId: string;
  active: boolean;
  expiresAt: string | null;
  lots?: { id: string; expiresAt: string; units: number }[];
  priceUpdatedAt: string;
  onOffer?: boolean;
  priceA?: number;
}

export interface TicketLine {
  productId: string;
  name: string;
  barcode: string;
  price: number;
  qty: number;
}

export interface SaleItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  /**
   * Lo que costaba la unidad el día que se vendió. Sin costo cargado va
   * `undefined`: nunca 0 ni estimado, así el margen no miente. Las ventas
   * guardadas antes de esto no lo traen.
   */
  cost?: number;
}

export interface Sale {
  id: string;
  createdAt: string;
  paymentMethod: PayMethod;
  note: string;
  total: number;
  paid: number | null;
  items: SaleItem[];
}

export interface CashShift {
  id: string;
  status: "open" | "closed";
  openingCash: number;
  closingCash: number | null;
  expectedCash: number | null;
  salesTotal: number | null;
  salesCount: number | null;
  note: string | null;
  openedAt: string;
  closedAt: string | null;
  virtualCel?: number | null;
  virtualSube?: number | null;
  safeCount?: number | null;
}

export interface CashDrop {
  id: string;
  shiftId: string;
  amount: number;
  note: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  days: number[];
  orderDays?: number[];
  cadence?: "weekly" | "monthly";
  /** Días del mes en que entregan. */
  monthDays?: number[];
  /** Días del mes en que se levanta el pedido. */
  monthOrderDays?: number[];
  categoryIds?: string[];
  notes: string;
  whatsapp: string;
  /** Tipo de factura del proveedor. Sirve para elegir el factor del rubro. */
  invoiceType?: "A" | "X";
}

export interface ShiftDef {
  key: string;
  name: string;
  start: number;
}

export interface Settings {
  name: string;
  rubro: KioskRubro;
  city: string;
  onboarded: boolean;
  ownerPinHash?: string;
  printerBaud?: number;
  voiceEnabled: boolean;
  voiceLang: string;
  voiceGender: "female" | "male";
  voiceRate: number;
  theme: ThemeMode;
  blockZeroStock: boolean;
  stockAlertsEnabled: boolean;
  cashFloat: number;
  cashThreshold: number;
  phrases: string[];
  shifts: ShiftDef[];
  tasks: Record<string, string[]>;
  taskRemindersEnabled: boolean;
  mpFeePct?: number;
  monthExpenses?: { name: string; amount: number }[];
  ledgerTints?: Record<string, "sage" | "warn" | "danger" | "info">;
  ledgerLabels?: Record<string, string>;
  ticketHeader?: string;
  ticketFooter?: string;
  ticketThanks?: string;
  printerMm?: 58 | 80;
  priceMarkups?: Record<string, number>;
  priceTants?: Record<string, number>;
  priceMarkupsA?: Record<string, number>;
  priceTantsA?: Record<string, number>;
  roundMode?: "up" | "down";
  roundStep?: number;
  storeLogo?: string;
  ticketArt?: string;
  fiscal?: {
    enabled: boolean;
    cuit: string;
    puntoVenta: string;
    tipo: "A" | "B" | "C";
    api: string;
    queue: number;
  };
}

export interface OrderLine {
  productId: string;
  name: string;
  qty: number;
  asUnit?: boolean;
  /** Unidades que realmente entraron. Ausente = todavía no se revisó. */
  receivedUnits?: number;
}

export interface OrderDraft {
  id: string;
  supplierId: string;
  supplierName: string;
  lines: OrderLine[];
  text: string;
  createdAt: string;
  sent: boolean;
  received: boolean;
  remitoPhoto?: string;
  receiptStatus?: "complete" | "short";
  /** YYYY-MM-DD — día que se levanta, si el proveedor lo tiene. */
  liftAt?: string;
  /** YYYY-MM-DD — día que entrega, si el proveedor lo tiene. */
  deliverAt?: string;
}

export interface StockMove {
  id: string;
  productId: string;
  productName: string;
  delta: number;
  reason: string;
  createdAt: string;
}

export interface Refund {
  id: string;
  kind: "cliente" | "proveedor";
  createdAt: string;
  productId: string;
  productName: string;
  units: number;
  packs: number;
  amount: number;
  paymentMethod: PayMethod | "credito";
  saleId?: string;
  supplierId?: string;
  supplierName?: string;
  note: string;
}

export interface DayBook {
  date: string;
  safeCount: number;
  virtualCel: number;
  virtualSube: number;
  facA: number;
  facX: number;
  cigarrillos: number;
  expenses: { id: string; name: string; amount: number }[];
  notes: string;
  cells?: Record<string, number>;
}

export interface MonthAgg {
  ym: string;
  ventas: number;
  tickets: number;
  mp: number;
  efectivo: number;
  debito: number;
  cogs: number;
  /** Unidades vendidas de las que no se supo el costo: `cogs` queda corto. */
  cogsMissing?: number;
  /** Ausente o `false` = plegado con el método viejo, que estimaba el costo. */
  cogsTrusted?: boolean;
  /** Plata devuelta a clientes ese mes. Ausente = el mes se plegó sin esto. */
  devoluciones?: number;
  /** Lo que había costado la mercadería que volvió a la góndola. */
  devolucionesCogs?: number;
}

export interface MonthSheet {
  ym: string;
  archivedAt: string;
  labels?: Record<string, string>;
  days: { date: string; cells: Record<string, number> }[];
}

export type StaffRole = "encargado" | "cajero" | "otro";
export type StaffPayEvery = "mes" | "semana" | "turno";

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  payEvery: StaffPayEvery;
  amount: number;
  whatsapp: string;
  active: boolean;
}

export interface RosterSlot {
  date: string;
  shiftKey: string;
  staffId: string;
}

export interface StaffPayout {
  id: string;
  staffId: string;
  name: string;
  amount: number;
  kind: "sueldo" | "adelanto";
  fromCaja: boolean;
  createdAt: string;
  note: string;
}

export interface KioskPayload {
  products: Product[];
  categories: Category[];
  sales: Sale[];
  settings: Settings;
  suppliers: Supplier[];
  shifts: CashShift[];
  drops: CashDrop[];
  orders: OrderDraft[];
  movements: StockMove[];
  refunds?: Refund[];
  ticket: TicketLine[];
  payMethod: PayMethod;
  books?: DayBook[];
  monthAggs?: MonthAgg[];
  monthSheets?: MonthSheet[];
  staff?: StaffMember[];
  roster?: RosterSlot[];
  payouts?: StaffPayout[];
  /**
   * Hasta dónde de la cinta llega esta fotocopia: el cursor de quien la subió,
   * qué aparato era y cuándo se sacó la foto (con su reloj). Un aparato que
   * arranca de la fotocopia sigue la cinta desde ahí (ver pull-start.ts).
   */
  mark?: CopyMark;
  /** Productos borrados: no se reviven con eventos viejos (ver deleted.ts). */
  deletedProducts?: DeletedProduct[];
}

export interface DeletedProduct {
  id: string;
  at: string;
  name?: string;
  device?: string;
}

export interface CopyMark {
  seq: number;
  device: string;
  at: string;
}
