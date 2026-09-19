import type {
  Category,
  KioskRubro,
  Product,
  Settings,
  Supplier,
} from "./types";

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const ymdIn = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

export const RUBROS: { id: KioskRubro; label: string; hint: string }[] = [
  { id: "kiosco", label: "Kiosco", hint: "Cigarrillos, bebidas, golosinas" },
  { id: "almacen", label: "Almacén", hint: "Yerba, fideos, limpieza" },
  { id: "despensa", label: "Despensa", hint: "Barrio, fiambre y fiado" },
  { id: "maxikiosco", label: "Maxikiosco", hint: "Más góndola, mismo mostrador" },
  { id: "otro", label: "Otro", hint: "Un local, las mismas reglas" },
];

export const SEED_CATEGORIES: Category[] = [
  { id: "cig", name: "Cigarrillos", sort: 1 },
  { id: "beb", name: "Bebidas", sort: 2 },
  { id: "gol", name: "Golosinas", sort: 3 },
  { id: "alm", name: "Almacén", sort: 4 },
  { id: "lac", name: "Lácteos", sort: 5 },
  { id: "fia", name: "Fiambres", sort: 6 },
  { id: "kio", name: "Kiosco", sort: 7 },
];

function p(
  id: string,
  name: string,
  barcode: string,
  price: number,
  categoryId: string,
  stock: number,
  stockMin: number,
  costRatio = 0.68,
  extra: Partial<Product> = {},
): Product {
  return {
    id,
    name,
    barcode,
    price,
    cost: Math.round(price * costRatio),
    stock,
    stockMin,
    categoryId,
    active: true,
    expiresAt: null,
    priceUpdatedAt: daysAgo(2),
    ...extra,
  };
}

export const SEED_PRODUCTS: Product[] = [
  p("p1", "Marlboro Box 20", "77910001", 8500, "cig", 24, 8, 0.78, {
    priceUpdatedAt: daysAgo(1),
    packQty: 10,
    packBarcode: "77918001",
  }),
  p("p2", "Lucky Strike Box 20", "77910002", 7800, "cig", 18, 8, 0.78, { packQty: 10, packBarcode: "77918002" }),
  p("p3", "Philip Morris 20", "77910003", 6200, "cig", 6, 10, 0.8, { packQty: 10, packBarcode: "77918003" }),
  p("p4", "Chesterfield 20", "77910004", 5900, "cig", 14, 8, 0.8, { packQty: 10, packBarcode: "77918004" }),
  p("p5", "Cigarrillo suelto", "77910005", 700, "cig", 40, 20, 0.55, { priceUpdatedAt: now() }),

  p("p6", "Coca-Cola 2.25 L", "77920001", 3200, "beb", 18, 6, 0.7, {
    priceUpdatedAt: daysAgo(0.4),
    packQty: 8,
    packBarcode: "77928001",
  }),
  p("p7", "Coca-Cola 500 ml", "77920002", 1800, "beb", 28, 10, 0.68, { packQty: 12, packBarcode: "77928002" }),
  p("p8", "Sprite 2.25 L", "77920003", 3000, "beb", 10, 4, 0.7, { packQty: 8, packBarcode: "77928003" }),
  p("p9", "Agua Villavicencio 2 L", "77920004", 1600, "beb", 16, 6, 0.65, { packQty: 6, packBarcode: "77928004" }),
  p("p10", "Speed 473 ml", "77920005", 2200, "beb", 12, 6, 0.72, { packQty: 6, packBarcode: "77928005" }),
  p("p11", "Quilmes 1 L", "77920006", 2800, "beb", 8, 6, 0.7, { packQty: 12, packBarcode: "77928006" }),
  p("p12", "Cepita naranja 1 L", "77920007", 1900, "beb", 4, 6, 0.66, {
    expiresAt: ymdIn(9),
    packQty: 6,
    packBarcode: "77928007",
  }),

  p("p13", "Alfajor Havanna", "77930001", 2500, "gol", 20, 8, 0.55, { packQty: 12, packBarcode: "77938001" }),
  p("p14", "Alfajor Guaymallén", "77930002", 800, "gol", 36, 12, 0.5, { packQty: 24, packBarcode: "77938002" }),
  p("p15", "Oreo 118 g", "77930003", 2800, "gol", 9, 6, 0.62, { packQty: 12, packBarcode: "77938003" }),
  p("p16", "Chicles Beldent", "77930004", 1200, "gol", 22, 8, 0.5, { packQty: 20, packBarcode: "77938004" }),
  p("p17", "Sugus bolsa", "77930005", 900, "gol", 14, 6, 0.48, { packQty: 12, packBarcode: "77938005" }),
  p("p18", "Milka 55 g", "77930006", 3200, "gol", 7, 6, 0.6, { packQty: 12, packBarcode: "77938006" }),
  p("p19", "Lays clásicas 45 g", "77930007", 2200, "gol", 11, 6, 0.58, { packQty: 10, packBarcode: "77938007" }),
  p("p20", "Palitos salados", "77930008", 1500, "gol", 2, 8, 0.52, { packQty: 10, packBarcode: "77938008" }),

  p("p21", "Yerba Playadito 1 kg", "77940001", 6500, "alm", 8, 4, 0.72, { priceUpdatedAt: daysAgo(3) }),
  p("p22", "Azúcar Ledesma 1 kg", "77940002", 1800, "alm", 10, 4, 0.7),
  p("p23", "Aceite Natura 900 ml", "77940003", 4200, "alm", 7, 4, 0.74, { packQty: 6, packBarcode: "77948003" }),
  p("p24", "Fideos Matarazzo 500 g", "77940004", 1600, "alm", 12, 6, 0.68, { packQty: 10, packBarcode: "77948004" }),
  p("p25", "Arroz Gallo Oro 1 kg", "77940005", 2400, "alm", 9, 4, 0.7),
  p("p26", "Galletitas Criollitas", "77940006", 1900, "alm", 14, 6, 0.55, { packQty: 16, packBarcode: "77948006" }),

  p("p27", "Leche La Serenísima 1 L", "77950001", 1800, "lac", 16, 8, 0.78, {
    expiresAt: ymdIn(6),
    packQty: 6,
    packBarcode: "77958001",
  }),
  p("p28", "Yogur Ser bebible", "77950002", 1400, "lac", 10, 6, 0.72, { expiresAt: ymdIn(4), packQty: 8, packBarcode: "77958002" }),
  p("p29", "Manteca La Serenísima 200 g", "77950003", 3200, "lac", 6, 4, 0.76, { expiresAt: ymdIn(12) }),

  p("p30", "Jamón cocido et. 100 g", "77960001", 2200, "fia", 8, 4, 0.7, { expiresAt: ymdIn(5) }),
  p("p31", "Queso tybo et. 100 g", "77960002", 2400, "fia", 7, 4, 0.7),
  p("p32", "Salchichas Patyviena", "77960003", 2800, "fia", 9, 4, 0.68, { packQty: 12, packBarcode: "77968003" }),

  p("p33", "Encendedor BIC", "77970001", 1500, "kio", 20, 8, 0.45, { packQty: 50, packBarcode: "77978001" }),
  p("p34", "Pilas Duracell AA x2", "77970002", 3800, "kio", 10, 4, 0.62, { packQty: 10, packBarcode: "77978002" }),
  p("p35", "Preservativo Prime x3", "77970003", 2500, "kio", 12, 6, 0.5),
  p("p36", "Hielo 2 kg", "77970004", 1800, "kio", 6, 8, 0.4, { packQty: 5, packBarcode: "77978004" }),
  p("p37", "Carga virtual $1000", "77970005", 1000, "kio", 99, 0, 0.97),
  p("p38", "Diario Clarín", "77970006", 1800, "kio", 8, 4, 0.85, { priceUpdatedAt: now() }),
];

export const SEED_SUPPLIERS: Supplier[] = [
  {
    id: "s1",
    name: "Distribuidora tabaco",
    days: [1, 4],
    orderDays: [1, 4],
    categoryIds: ["cig"],
    invoiceType: "X",
    notes: "Cigarrillos y encendedores. Pedir antes de las 10.",
    whatsapp: "5491100000001",
  },
  {
    id: "s2",
    name: "Coca-Cola FEMSA",
    days: [2, 5],
    orderDays: [1, 4],
    categoryIds: ["beb"],
    invoiceType: "A",
    notes: "Bebidas y aguas. Mínimo 5 bultos.",
    whatsapp: "5491100000002",
  },
  {
    id: "s3",
    name: "Arcor / golosinas",
    days: [3],
    orderDays: [2],
    categoryIds: ["gol"],
    invoiceType: "X",
    notes: "Alfajores, snacks y chicles.",
    whatsapp: "5491100000003",
  },
  {
    id: "s4",
    name: "La Serenísima",
    days: [1, 3, 5],
    orderDays: [7, 2, 4],
    categoryIds: ["lac"],
    invoiceType: "A",
    notes: "Lácteos. Revisar vencimientos al recibir.",
    whatsapp: "5491100000004",
  },
  {
    id: "s5",
    name: "Mayorista del barrio",
    days: [2, 6],
    orderDays: [1, 5],
    categoryIds: ["alm", "fia", "kio"],
    invoiceType: "X",
    notes: "Almacén, fiambres y kiosco.",
    whatsapp: "5491100000005",
  },
];

export const SEED_SETTINGS: Settings = {
  name: "Kiosco El Faro",
  rubro: "kiosco",
  city: "",
  onboarded: false,
  ownerPinHash: "",
  printerBaud: 9600,
  voiceEnabled: true,
  voiceLang: "es-AR",
  voiceGender: "female",
  voiceRate: 1,
  theme: "dark",
  blockZeroStock: false,
  stockAlertsEnabled: true,
  cashFloat: 15000,
  cashThreshold: 40000,
  phrases: [
    "Gracias",
    "Muchas gracias",
    "Se vendió todo",
    "Apoyar tarjeta",
    "Cigarrillo suelto con Mercado Pago, 200 pesos más",
  ],
  shifts: [
    { key: "manana", name: "Mañana", start: 6 },
    { key: "tarde", name: "Tarde", start: 14 },
    { key: "noche", name: "Noche", start: 22 },
  ],
  tasks: {
    manana: [
      "Revisar lácteos y vencimientos",
      "Armar pedido del día",
      "Contar cigarrillos",
      "Limpiar mostrador y vidriera",
    ],
    tarde: [
      "Reponer góndola de bebidas",
      "Controlar caja chica",
      "Bajar hielo si hace calor",
    ],
    noche: [
      "Cerrar turno y cuadre",
      "Retiro a caja fuerte si corresponde",
      "Apagar luces de vidriera",
    ],
  },
  taskRemindersEnabled: true,
  mpFeePct: 0.06,
  fiscalCondition: "monotributo",
  taxName: "IVA",
  taxPct: 21,
  shelfIncludesTax: true,
  roundMode: "up",
  roundStep: 100,
  priceMarkups: {
    cig: 1.5,
    beb: 1.5,
    gol: 1.85,
    alm: 1.85,
    lac: 1.7,
  },
  priceMarkupsA: {
    cig: 1.75,
    beb: 1.8,
    gol: 2.12,
    alm: 2.12,
    lac: 1.7,
  },
  monthExpenses: [
    { name: "Alquiler", amount: 0 },
    { name: "Luz", amount: 0 },
    { name: "Expensas", amount: 0 },
    { name: "Sueldos", amount: 0 },
    { name: "Contador", amount: 0 },
  ],
};

export const CATEGORY_SUPPLIER: Record<string, string> = {
  cig: "s1",
  beb: "s2",
  gol: "s3",
  lac: "s4",
  alm: "s5",
  fia: "s5",
  kio: "s5",
};
