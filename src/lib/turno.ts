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
