/** El menos va antes del peso: -$1.700, nunca $-1.700. */
function signed(v: number, body: string): string {
  return `${v < 0 ? "-" : ""}$${body}`;
}

export function formatARS(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  return signed(v, Math.abs(v).toLocaleString("es-AR"));
}

export function formatMiles(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  return v.toLocaleString("es-AR");
}

export function formatARSCompact(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) {
    return signed(v, `${(abs / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`);
  }
  if (abs >= 10_000) {
    return signed(v, `${(abs / 1000).toLocaleString("es-AR", { maximumFractionDigits: 0 })} mil`);
  }
  return formatARS(v);
}

export const PAY_LABEL: Record<"efectivo" | "mercadopago" | "debito", string> = {
  efectivo: "Efectivo",
  mercadopago: "Mercado Pago",
  debito: "Débito",
};

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })} ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const start = startOfDay(d);
  const today = startOfDay();
  return Math.round((start.getTime() - today.getTime()) / 86_400_000);
}

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function weekdayMon1(d = new Date()): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function currentShiftKey(
  shifts: { key: string; start: number }[],
  hour: number,
): string {
  const sorted = [...shifts].sort((a, b) => a.start - b.start);
  let current = sorted[sorted.length - 1]?.key ?? "noche";
  for (const s of sorted) {
    if (hour >= s.start) current = s.key;
  }
  return current;
}

export function shiftLabel(
  shifts: { key: string; name: string }[],
  key: string,
): string {
  return shifts.find((s) => s.key === key)?.name ?? (key === "noche" ? "Noche" : key === "tarde" ? "Tarde" : "Mañana");
}

export function priceFreshness(iso: string | null | undefined): "fresh" | "warn" | "stale" | "unknown" {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const days = (Date.now() - d.getTime()) / 86_400_000;
  if (days < 7) return "fresh";
  if (days < 30) return "warn";
  return "stale";
}

const UNITS = [
  "cero",
  "un",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
];
const TENS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = [
  "",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];

function underThousand(n: number): string {
  if (n === 100) return "cien";
  if (n < 20) return UNITS[n] ?? "cero";
  if (n < 30) return n === 20 ? "veinte" : `veinti${UNITS[n - 20]}`;
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = h ? HUNDREDS[h] : "";
  if (!rest) return head;
  if (rest < 20) return `${head}${h ? " " : ""}${UNITS[rest]}`.trim();
  if (rest < 30) return `${head}${h ? " " : ""}${rest === 20 ? "veinte" : `veinti${UNITS[rest - 20]}`}`.trim();
  const t = Math.floor(rest / 10);
  const u = rest % 10;
  const tail = u ? `${TENS[t]} y ${UNITS[u]}` : TENS[t];
  return `${head}${h ? " " : ""}${tail}`.trim();
}

export function speakNumberAR(n: number): string {
  const v = Math.round(Math.abs(Number.isFinite(n) ? n : 0));
  if (v === 0) return "cero pesos";
  if (v === 1) return "un peso";
  let words = "";
  const millions = Math.floor(v / 1_000_000);
  const thousands = Math.floor((v % 1_000_000) / 1000);
  const rest = v % 1000;
  if (millions) words += millions === 1 ? "un millón" : `${underThousand(millions)} millones`;
  if (thousands) {
    if (words) words += " ";
    words += thousands === 1 ? "mil" : `${underThousand(thousands)} mil`;
  }
  if (rest) {
    if (words) words += " ";
    words += underThousand(rest);
  }
  return `${words} pesos`;
}
