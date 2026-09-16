import { daysUntil, formatARS, weekdayMon1 } from "@/lib/format";
import { packOf } from "@/lib/pack";
import type { OrderDraft, Product, Sale, Supplier } from "@/lib/types";

export type Suggestion = {
  id: string;
  kind: "offer" | "order" | "stock" | "shift";
  title: string;
  body: string;
  productId?: string;
  supplierId?: string;
};

export function buildSuggestions(opts: {
  products: Product[];
  sales: Sale[];
  suppliers: Supplier[];
  orders: OrderDraft[];
}): Suggestion[] {
  const { products, sales, suppliers, orders } = opts;
  const out: Suggestion[] = [];
  const weekAgo = Date.now() - 7 * 86_400_000;
  const weekSales = sales.filter((s) => new Date(s.createdAt).getTime() >= weekAgo);
  const sold = new Map<string, number>();
  for (const s of weekSales) {
    for (const it of s.items) sold.set(it.productId, (sold.get(it.productId) ?? 0) + it.qty);
  }

  for (const p of products.filter((x) => x.active)) {
    const d = daysUntil(p.expiresAt);
    if (d !== null && d >= 0 && d <= 10 && !p.onOffer) {
      out.push({
        id: `off-${p.id}`,
        kind: "offer",
        title: `Oferta: ${p.name}`,
        body:
          d === 0
            ? "Vence hoy. Ponelo en oferta y avisale al que atiende."
            : `Vence en ${d} días. Una oferta corta mueve la góndola antes de que se pierda.`,
        productId: p.id,
      });
    }
    if (p.onOffer) {
      out.push({
        id: `ask-${p.id}`,
        kind: "shift",
        title: `${p.name} está en oferta`,
        body: "En el mostrador: preguntale al cliente si quiere aprovecharla.",
        productId: p.id,
      });
    }
    const q = sold.get(p.id) ?? 0;
    if (q >= 8 && p.stock <= p.stockMin * 2) {
      out.push({
        id: `hot-${p.id}`,
        kind: "stock",
        title: `Se está yendo ${p.name}`,
        body: `Esta semana ${q} u. Hay ${p.stock}. Conviene pedir más en el próximo viaje.`,
        productId: p.id,
      });
    }
  }

  const today = weekdayMon1();
  for (const s of suppliers.filter((x) => x.days.includes(today))) {
    const pending = orders.find((o) => o.supplierId === s.id && !o.sent);
    const lines = pending?.lines.length ?? 0;
    const catsNeed = products.filter((p) => p.active && p.stock <= p.stockMin).length;
    out.push({
      id: `sup-${s.id}`,
      kind: "order",
      title: `Hoy pasa ${s.name}`,
      body:
        lines > 0
          ? `Hay un pedido listo (${lines} líneas). Armalo o mandalo antes de que llegue.`
          : catsNeed
            ? `Hay faltantes. Armá el pedido — si no, el camión se va vacío de tu lista.`
            : "Góndola en orden. Igual mirá si falta algo de impulso.",
      supplierId: s.id,
    });
  }

  return out.slice(0, 12);
}

export function todayOrderTotal(orders: OrderDraft[]): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return orders
    .filter((o) => new Date(o.createdAt) >= start)
    .reduce((a, o) => a + o.lines.reduce((s, l) => s + l.qty, 0), 0);
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Buen día";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function funLine(d = new Date()): string {
  const lines = [
    "Si el ticket canta, la góndola también.",
    "El vuelto exacto es un deporte olímpico.",
    "Hoy el mostrador manda. El Excel espera.",
    "Un código bien leído vale más que diez preguntas.",
    "La caja chica no es cajón de olvido.",
    "Preguntá si lleva hielo. Siempre hay uno que sí.",
  ];
  return lines[d.getDate() % lines.length]!;
}

export function orderCost(
  lines: { productId: string; qty: number }[],
  products: Product[],
): number {
  return lines.reduce((a, l) => {
    const p = products.find((x) => x.id === l.productId);
    const unit = p?.cost ?? (p?.price ?? 0) * 0.7;
    return a + unit * l.qty * packOf(p);
  }, 0);
}

export function formatHint(n: number): string {
  return formatARS(n);
}
