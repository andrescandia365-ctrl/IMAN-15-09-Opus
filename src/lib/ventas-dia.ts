import type { CashShift, Sale } from "@/lib/types";

/**
 * El total vendido de cada día de un mes, para el gráfico de El mes.
 *
 * Las ventas sueltas solo cubren los últimos días: las más viejas se pliegan
 * en el resumen del mes, que no guarda el día. Para esos días se usan los
 * turnos cerrados (cada uno trae lo que vendió), en el día LOCAL en que se
 * abrieron. Un día sin ventas sueltas ni turnos queda en null ("sin dato"),
 * no en cero: puede haber vendido y ya no quedar el detalle.
 */
export function ventasPorDia(
  ym: string,
  sales: Pick<Sale, "createdAt" | "total">[],
  shifts: Pick<CashShift, "openedAt" | "status" | "salesTotal">[],
  opts: { hoy: string; desdeVivas: string },
): (number | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const dias = new Date(y!, m!, 0).getDate();
  const out: (number | null)[] = Array.from({ length: dias }, () => null);
  for (let d = 1; d <= dias; d++) {
    const key = `${ym}-${String(d).padStart(2, "0")}`;
    // Del día que empieza la lista de ventas en adelante, está completa: cero es cero.
    if (key >= opts.desdeVivas && key <= opts.hoy) out[d - 1] = 0;
  }
  for (const s of sales) {
    const key = diaLocal(s.createdAt);
    if (!key.startsWith(ym) || key < opts.desdeVivas) continue;
    const i = Number(key.slice(8, 10)) - 1;
    out[i] = (out[i] ?? 0) + s.total;
  }
  for (const t of shifts) {
    if (t.status !== "closed" || t.salesTotal == null) continue;
    const key = diaLocal(t.openedAt);
    if (!key.startsWith(ym) || key >= opts.desdeVivas) continue;
    const i = Number(key.slice(8, 10)) - 1;
    out[i] = (out[i] ?? 0) + t.salesTotal;
  }
  return out;
}

function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Desde qué día la lista de ventas sueltas está completa: el día siguiente al
 * de la venta más vieja, si la lista llegó al tope (pudo plegar ventas de ese
 * día); si no, el día del corte de 7 días.
 */
export function desdeVentasVivas(
  sales: Pick<Sale, "createdAt">[],
  opts: { hoy: Date; dias: number; tope: number },
): string {
  const corte = new Date(opts.hoy);
  corte.setDate(corte.getDate() - opts.dias + 1);
  let desde = diaLocal(corte.toISOString());
  if (sales.length >= opts.tope) {
    const vieja = sales.reduce((a, s) => (s.createdAt < a ? s.createdAt : a), sales[0]!.createdAt);
    const d = new Date(vieja);
    d.setDate(d.getDate() + 1);
    const k = diaLocal(d.toISOString());
    if (k > desde) desde = k;
  }
  return desde;
}
