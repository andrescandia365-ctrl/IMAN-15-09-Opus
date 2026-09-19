import type { TicketLine } from "./types";

/**
 * Suma los renglones que mandó el celu al ticket que ya está en el mostrador.
 * El mismo producto suma cantidad y se queda con el precio con que ya estaba
 * cargado; lo que no estaba entra como vino, al final.
 */
export function mergeTicketLines(actual: TicketLine[], delCelu: TicketLine[]): TicketLine[] {
  const out = actual.map((l) => ({ ...l }));
  for (const l of delCelu) {
    const cur = out.find((x) => x.productId === l.productId);
    if (cur) cur.qty += l.qty;
    else out.push({ ...l });
  }
  return out;
}
