import type { CashShift, MonthMark } from "@/lib/types";

/**
 * Quién pliega el mes y qué ya está plegado.
 *
 * Las ventas viejas se pliegan en `monthAggs` y salen de la lista. Un ticket
 * está en la lista o en el resumen, nunca en los dos. Para que eso aguante con
 * varios aparatos:
 *
 * - Pliega uno solo: el que abrió el último turno, que es la caja. Sin turno
 *   abierto no se cobra, así que siempre hubo alguien.
 * - El resumen lleva una marca (`MonthMark`) de hasta dónde llega, por aparato
 *   que cobró. Las ventas de un aparato llegan en el orden en que se hicieron
 *   (la cinta va por seq), así que si la caja plegó una de B hasta tal hora,
 *   tuvo todas las de B de antes. Una marca sola para todo el local cubriría
 *   ventas de otro aparato que la caja todavía no había bajado.
 * - Todos sacan de la lista lo que la marca cubre, y una venta cubierta que
 *   llega tarde por la cinta no se vuelve a sumar.
 * - El que no pliega nunca descarta una venta que la marca no cubra: si la caja
 *   se rompió y nadie abrió otro turno, esas ventas esperan en la lista.
 */

/** La franja antes de cada marca que se decide por id y no por fecha. */
export const BORDE_MS = 86_400_000;

/** La marca de las ventas que no dicen qué aparato las cobró (las de antes). */
export const SIN_APARATO = "-";

type Fila = { id: string; createdAt: string; deviceId?: string };

function ms(iso: string): number {
  return new Date(iso).getTime();
}

function origen(f: { deviceId?: string }): string {
  return f.deviceId || SIN_APARATO;
}

/** Ya está adentro del resumen del mes. */
export function cubierto(mark: MonthMark | undefined, f: Fila): boolean {
  if (!mark) return false;
  const hasta = mark.hasta[origen(f)];
  if (hasta && ms(f.createdAt) < ms(hasta) - BORDE_MS) return true;
  return mark.borde.some((b) => b.id === f.id);
}

/** El aparato que abrió el último turno, o null si ese turno es de antes de guardarlo. */
export function quienPliega(shifts: CashShift[]): string | null {
  let ultimo: CashShift | null = null;
  for (const s of shifts) if (!ultimo || s.openedAt > ultimo.openedAt) ultimo = s;
  return ultimo?.deviceId ?? null;
}

function tope(mark: MonthMark): number {
  let max = -Infinity;
  for (const h of Object.values(mark.hasta)) max = Math.max(max, ms(h));
  return max;
}

/**
 * De qué lado se queda el resumen al juntar dos copias. Gana la marca que está
 * igual o más adelantada en todos los aparatos; si empatan, la de este
 * aparato. Con marca gana sobre sin marca. null = ninguno tiene marca (resumen
 * de antes): se junta como antes.
 *
 * Si cada una va adelante en un aparato distinto, plegaron dos a la vez (un
 * aparato todavía no se enteró de que otro abrió turno): gana la que llega más
 * lejos. Es el único caso en que el resumen puede quedar corto.
 */
export function ladoDelResumen(server: MonthMark | undefined, local: MonthMark | undefined): "server" | "local" | null {
  if (!server && !local) return null;
  if (!server) return "local";
  if (!local) return "server";
  let serverAdelante = false;
  let localAdelante = false;
  for (const d of new Set([...Object.keys(server.hasta), ...Object.keys(local.hasta)])) {
    const s = server.hasta[d] ? ms(server.hasta[d]!) : -Infinity;
    const l = local.hasta[d] ? ms(local.hasta[d]!) : -Infinity;
    if (s > l) serverAdelante = true;
    if (l > s) localAdelante = true;
  }
  if (serverAdelante && !localAdelante) return "server";
  if (localAdelante && !serverAdelante) return "local";
  if (!serverAdelante) return "local";
  return tope(server) > tope(local) ? "server" : "local";
}

/** La marca después de plegar `nuevos` (ventas y devoluciones). */
export function marcaDespues(mark: MonthMark | undefined, nuevos: Fila[]): MonthMark | undefined {
  if (!nuevos.length) return mark;
  const hasta: Record<string, string> = { ...(mark?.hasta ?? {}) };
  for (const n of nuevos) {
    const d = origen(n);
    if (!hasta[d] || ms(n.createdAt) > ms(hasta[d]!)) hasta[d] = n.createdAt;
  }
  const porId = new Map<string, MonthMark["borde"][number]>();
  const candidatos = [
    ...(mark?.borde ?? []),
    ...nuevos.map((n) => ({ id: n.id, at: n.createdAt, d: origen(n) })),
  ];
  for (const b of candidatos) {
    const h = hasta[b.d];
    if (h && ms(b.at) >= ms(h) - BORDE_MS) porId.set(b.id, b);
  }
  return { hasta, borde: [...porId.values()] };
}
