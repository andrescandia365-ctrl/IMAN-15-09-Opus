export type PayMethod = "efectivo" | "mercadopago" | "debito";
export type ViewId = "taller" | "counter" | "inventory" | "orders" | "cash" | "expire" | "reports" | "settings" | "mas";
export type ThemeMode = "dark" | "light";
export type KioskRubro = "kiosco" | "almacen" | "despensa" | "maxikiosco" | "otro";
export type FiscalCondition = "responsable_inscripto" | "monotributo" | "en_negro";

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
  lots?: { id: string; expiresAt: string; units: number; createdAt?: string }[];
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
  /**
   * Se cobró (entero o en parte) con una promo: cuál, y el precio de góndola
   * por unidad de ese momento. `price` es lo que se cobró por unidad (en un
   * combo, su parte del precio del combo, que puede tener centavos). Un
   * producto va siempre en un solo renglón: el `sale` que aplica otro aparato
   * junta las cantidades por producto.
   */
  promoId?: string;
  listPrice?: number;
  /** Cuántas de las `qty` unidades entraron en la promo (en un 2x1 con tres, dos). */
  promoQty?: number;
}

export interface Sale {
  id: string;
  createdAt: string;
  paymentMethod: PayMethod;
  note: string;
  total: number;
  paid: number | null;
  items: SaleItem[];
  /** El aparato que la cobró. Ausente en las de antes (ver plegado.ts). */
  deviceId?: string;
  /**
   * El turno en que se cobró. Ausente en las ventas de antes y en las de un
   * aparato sin actualizar: esas cuentan por hora (ver `ventasDelTurno`).
   */
  shiftId?: string;
}

export interface CashShift {
  id: string;
  status: "open" | "closed";
  /**
   * El aparato que abrió el turno. El que abrió el último es el que pliega el
   * mes (ver plegado.ts). Ausente en los turnos de antes.
   */
  deviceId?: string;
  /**
   * El aparato que lo cerró. Si no es el que lo abrió, el arqueo lo hizo otro
   * (una toma forzada de la caja): el historial lo marca. Ausente en los de antes.
   */
  closedBy?: string;
  /**
   * Se cerró en la caja nueva después de forzar la toma. Hace falta además de
   * `closedBy`: los turnos abiertos antes de que existiera `deviceId` no dicen
   * quién los abrió.
   */
  heredado?: boolean;
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
  /** Al cerrar: lo que se cobró en promo en el turno y lo que se descontó. */
  promoTotal?: number;
  promoAhorro?: number;
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

export const LEDGER_TAG_IDS = [
  "gasto",
  "empleado",
  "alquiler",
  "contador",
  "arca",
  "iibb",
  "expensas",
  "fumigacion",
  "retiro",
  "proveedor",
  "venta",
  "otro",
] as const;

export type BuiltinLedgerTag = (typeof LEDGER_TAG_IDS)[number];
/** Tag de una fila de input. Los de fábrica más los que arma el dueño. */
export type LedgerTag = BuiltinLedgerTag | (string & {});
export type LedgerKind = "input" | "formula" | "spacer";

export interface LedgerRow {
  id: string;
  label: string;
  kind: LedgerKind;
  /** Solo las de input. Las fórmulas no llevan tag. */
  tag?: string;
  /** Ocultar no borra las celdas que ya se cargaron. */
  hidden?: boolean;
}

export interface LedgerTagDef {
  id: string;
  label: string;
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
  /** Cómo facturás. Monotributo y en negro se guardan aparte aunque la cuenta sea la misma. */
  fiscalCondition?: FiscalCondition;
  /** Nombre del impuesto de góndola (IVA, IGV, ITBIS, VAT). */
  taxName?: string;
  /** Porcentaje entero: 21 es 21%. La cuenta usa este número, no un 21 fijo. */
  taxPct?: number;
  /** El precio de la góndola ya tiene el impuesto. En Argentina, sí. */
  shelfIncludesTax?: boolean;
  /** Viejo cajón de gastos del mes. Una pasada los pasa a filas y no se vuelve a sumar. */
  monthExpenses?: { name: string; amount: number }[];
  ledgerTints?: Record<string, "sage" | "warn" | "danger" | "info">;
  ledgerLabels?: Record<string, string>;
  /** Filas de Asientos que arma el dueño. Viaja en el evento settings. */
  ledgerRows?: LedgerRow[];
  /** Tags que creó el dueño, además de los de fábrica. */
  ledgerTags?: LedgerTagDef[];
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
  /** El turno en que se devolvió la plata (solo a clientes). Ausente = por hora. */
  shiftId?: string;
  /** El aparato que la hizo. Ausente en las de antes (ver plegado.ts). */
  deviceId?: string;
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

/**
 * Qué ventas y devoluciones ya están adentro de `monthAggs`. `hasta` va por
 * aparato que cobró ("-" = las que no lo dicen): todo lo de ese aparato
 * anterior a su `hasta` menos 24 h, más lo que figura en `borde` (lo plegado
 * en esas 24 h, por si el reloj de ese aparato se movió). Ver plegado.ts.
 */
export interface MonthMark {
  hasta: Record<string, string>;
  borde: { id: string; at: string; d: string }[];
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
  /** Lo que se cobró en promo ese mes, y lo que se descontó. Ausente = plegado antes de las promos. */
  promo?: number;
  promoAhorro?: number;
}

export interface MonthSheet {
  ym: string;
  archivedAt: string;
  labels?: Record<string, string>;
  /** Filas que había cuando se archivó. Septiembre viejo muestra estas, no las de ahora. */
  rows?: LedgerRow[];
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

/** Oferta y Liquidación: un precio por unidad. 2x1 y Combo: un precio por el conjunto. */
export type PromoKind = "oferta" | "liquidacion" | "2x1" | "combo";

/**
 * Una promo que cobra la caja mientras está vigente (ver promos.ts). Va aparte
 * del precio de góndola: alinear y Actualizar precios no la tocan, y al
 * terminar el precio vuelve solo. Viaja en el evento `promo`, entera.
 */
export interface Promo {
  id: string;
  kind: PromoKind;
  /** Para el ticket y la lista: "Combo merienda". */
  name: string;
  /** Qué lleva. Oferta y Liquidación: un producto, 1. 2x1: un producto, 2. */
  items: { productId: string; qty: number }[];
  /** Lo pone el kiosquero a mano. Por unidad (Oferta, Liquidación) o por el conjunto (2x1, Combo). */
  price: number;
  /** Días locales (todayKey), los dos incluidos. */
  from: string;
  until: string;
  /** El cartel dice "Hasta agotar stock". */
  hastaAgotarStock?: boolean;
  /** Terminada a mano antes de la fecha. */
  endedAt?: string | null;
  /** Alguien confirmó que sacó el cartel después de terminada. */
  retiradaAt?: string | null;
  createdAt: string;
  /** El más nuevo gana entre dos aparatos. */
  updatedAt: string;
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
  /** Hasta dónde llega `monthAggs` (ver plegado.ts). Ausente = plegado de antes. */
  monthMark?: MonthMark;
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
  promos?: Promo[];
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
