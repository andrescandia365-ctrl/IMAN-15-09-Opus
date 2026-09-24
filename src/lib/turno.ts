import type { CashShift, Refund, Sale } from "@/lib/types";

/**
 * Las ventas que entran en el arqueo de un turno.
 *
 * Una venta con `shiftId` es de ese turno y de ningún otro: con dos aparatos
 * vendiendo, la hora ya no alcanza para saber de qué caja es. Una venta sin
 * `shiftId` (cobrada antes de este cambio, o por un aparato sin actualizar)
 * cuenta como siempre: todo lo que se cobró desde que se abrió el turno.
 */
export function ventasDelTurno(sales: Sale[], shift: Pick<CashShift, "id" | "openedAt">): Sale[] {
  return sales.filter((s) => (s.shiftId ? s.shiftId === shift.id : s.createdAt >= shift.openedAt));
}

/**
 * Las devoluciones a clientes que entran en el arqueo de un turno. La misma
 * regla que las ventas: con `shiftId`, las de ese turno; sin, por hora.
 */
export function devolucionesDelTurno(refunds: Refund[], shift: Pick<CashShift, "id" | "openedAt">): Refund[] {
  return refunds.filter(
    (r) => r.kind === "cliente" && (r.shiftId ? r.shiftId === shift.id : r.createdAt >= shift.openedAt),
  );
}

type TurnoVisto = { id?: string; status?: string; deviceId?: string };

/**
 * Los turnos que siguen abiertos según la fotocopia del local y los eventos
 * `shift` de la cinta. Un turno cerrado en cualquiera de los dos lados queda
 * cerrado: un turno nunca se reabre. Lo usa el servidor para saber si se puede
 * pasar la caja.
 */
export function turnosAbiertos(
  guardados: TurnoVisto[],
  eventos: { op?: string; shift?: TurnoVisto }[],
): { id: string; deviceId?: string }[] {
  const cerrados = new Set<string>();
  const abiertos = new Map<string, string | undefined>();
  for (const s of guardados) {
    if (!s?.id) continue;
    if (s.status === "closed") cerrados.add(s.id);
    else if (s.status === "open") abiertos.set(s.id, s.deviceId);
  }
  for (const e of eventos) {
    const s = e?.shift;
    if (!s?.id) continue;
    if (e.op === "close" || s.status === "closed") cerrados.add(s.id);
    else if (e.op === "open") abiertos.set(s.id, s.deviceId ?? abiertos.get(s.id));
  }
  return [...abiertos].filter(([id]) => !cerrados.has(id)).map(([id, deviceId]) => ({ id, deviceId }));
}

/**
 * El arqueo lo hizo otro aparato, no el que abrió el turno: pasa cuando se
 * fuerza la toma de la caja y el turno heredado se cierra en la caja nueva.
 * Un turno de antes sin los dos aparatos solo se marca si vino heredado.
 */
export function cerradoPorOtro(s: { deviceId?: string; closedBy?: string; heredado?: boolean }): boolean {
  return Boolean(s.heredado || (s.deviceId && s.closedBy && s.deviceId !== s.closedBy));
}
