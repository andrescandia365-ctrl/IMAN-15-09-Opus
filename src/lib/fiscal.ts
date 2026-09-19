import type { FiscalCondition, Settings } from "./types.ts";

export type { FiscalCondition };

/** IMAN prints a counter slip, not an ARCA invoice. */

export const TICKET_NOT_FISCAL = "Este ticket no es factura ni comprobante fiscal.";
export const TICKET_FISCAL_HINT = "La factura la emite ARCA. Consultá con tu contador.";
export const TICKET_FISCAL_SHORT = "No es factura. Consulta a tu contador.";

export const FISCAL_CONDITIONS: { id: FiscalCondition; label: string }[] = [
  { id: "responsable_inscripto", label: "Responsable inscripto" },
  { id: "monotributo", label: "Monotributo" },
  { id: "en_negro", label: "En negro" },
];

export function fiscalConditionOf(s: Settings | undefined): FiscalCondition {
  const v = s?.fiscalCondition;
  if (v === "responsable_inscripto" || v === "monotributo" || v === "en_negro") return v;
  return "monotributo";
}

/** Tasa 0–1 según el local. Si no hay, 0: la cuenta no inventa un 21%. */
export function taxRateOf(s: Settings | undefined): number {
  const n = s?.taxPct;
  if (typeof n === "number" && n > 0) return n / 100;
  return 0;
}

export function taxNameOf(s: Settings | undefined): string {
  const n = s?.taxName?.trim();
  return n || "IVA";
}

export function shelfIncludesTaxOf(s: Settings | undefined): boolean {
  return s?.shelfIncludesTax !== false;
}

/** Responsable inscripto y góndola con impuesto: las ventas traen un impuesto que no es ganancia. */
export function stripsShelfTax(s: Settings | undefined): boolean {
  return fiscalConditionOf(s) === "responsable_inscripto" && shelfIncludesTaxOf(s) && taxRateOf(s) > 0;
}

export function netOfGross(gross: number, s: Settings | undefined): number {
  if (!stripsShelfTax(s)) return gross;
  return gross / (1 + taxRateOf(s));
}

export function etiquetaVentas(c: FiscalCondition): string {
  return c === "en_negro" ? "Lo que entró" : "Ventas del mes";
}

export function etiquetaMargen(c: FiscalCondition): string {
  return c === "en_negro" ? "Lo que sobró" : "Margen del negocio";
}

export function etiquetaSinImpuesto(taxName: string): string {
  return `Sin el ${taxName}`;
}
