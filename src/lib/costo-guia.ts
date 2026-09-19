/**
 * Lo que la herramienta de precios le dice al encargado que tiene la boleta en
 * la mano: qué renglón copiar según la factura del proveedor del rubro, cuánto
 * trae el bulto y cuándo el número cargado no tiene sentido.
 *
 * La boleta de ejemplo usa la misma cuenta que la calculadora de bulto
 * (`porUnidad`): si mostraran números distintos, nadie confiaría en ninguno.
 */
import type { InvoiceKind } from "./pricing.ts";

export function recordatorioCosto(fac: InvoiceKind | null): string {
  if (fac === "A") return "Poné el SUBTOTAL por unidad: el precio sin IVA, con los impuestos internos ya sumados.";
  if (fac === "X") return "Poné el TOTAL que pagaste, por unidad. Con IVA incluido.";
  return "Poné lo que te salió cada unidad, como figura en la boleta.";
}

export const POR_UNIDAD = "Por UNIDAD, no el costo del bulto.";

export const QUE_NUMERO = "¿Qué número de la boleta?";

export function recordatorioBulto(n: number): string {
  return `Este viene en bulto de ${n}. Poné el costo del bulto.`;
}

/** Al escanear el código del bulto: el campo y el cartel dicen lo mismo. */
export function recordatorioEscaneoBulto(n: number): string {
  return `Escaneaste el bulto de ${n}. Poné el costo del bulto.`;
}

/** El costo por unidad que sale del bulto, al peso más cercano: el campo de costo no lleva centavos. */
export function porUnidad(costoBulto: number, unidades: number): number {
  if (!(unidades > 1)) return Math.round(costoBulto);
  return Math.round(costoBulto / unidades);
}

/** Las dos boletas del ejemplo. El renglón que se copia es `subtotal` en la A y `total` en la X. */
export const BOLETA_A = { unidades: 6, neto: 9246, internos: 970, subtotal: 10216, iva: 2145, total: 12361 };
export const BOLETA_X = { unidades: 6, total: 12158 };

export const PERDIDA = "Estarías vendiendo a pérdida. ¿Es correcto?";

export function sospechaBulto(n: number): string {
  return `¿Ese no es el costo del bulto? El bulto es de ${n}.`;
}

/**
 * El número del campo unidad parece el bulto entero, no la unidad.
 * Con costo anterior: cerca de packQty × ese costo (±30%).
 * Primera carga: cerca de packQty × un costo unitario razonable (la góndola
 * de hoy da la escala) o un total de remito partido por el bulto que cae
 * cerca de la góndola. No aplica si el número salió de la calculadora de bulto.
 */
export function pareceCostoDeBulto(o: {
  costo: number;
  costoAntes: number | null;
  bulto: number;
  desdeBulto: boolean;
  precioHoy?: number;
}): boolean {
  if (!(o.bulto > 1) || o.desdeBulto || !(o.costo > 0)) return false;
  if (o.costoAntes != null && o.costoAntes > 0) {
    const veces = o.costo / o.costoAntes;
    return Math.abs(veces / o.bulto - 1) <= 0.3;
  }
  const hoy = o.precioHoy ?? 0;
  if (!(hoy > 0)) return false;
  const unidadSiBulto = o.costo / o.bulto;
  const packGuia = (hoy / 2) * o.bulto;
  if (packGuia > 0 && Math.abs(o.costo / packGuia - 1) <= 0.5) return true;
  return o.costo > hoy * 1.4 && Math.abs(unidadSiBulto / hoy - 1) <= 0.6;
}

/**
 * Avisos sobre un costo que cargó el encargado. Son sospechas, no bloqueos:
 * se puede confirmar igual.
 * - Más caro que el precio NUEVO (margen + redondeo): a ese precio se vende a
 *   pérdida. Si el nuevo cubre, no avisa: el de góndola de hoy no cuenta.
 * - El número parece el bulto entero en el campo de unidad. No aplica si
 *   salió de la calculadora de bulto, que ya dividió.
 */
export function avisosDeCosto(o: {
  costo: number;
  costoAntes: number | null;
  precioNuevo: number;
  bulto: number;
  desdeBulto: boolean;
  precioHoy?: number;
}): string[] {
  const avisos: string[] = [];
  if (o.precioNuevo > 0 && o.costo > o.precioNuevo) avisos.push(PERDIDA);
  if (pareceCostoDeBulto(o)) avisos.push(sospechaBulto(o.bulto));
  return avisos;
}
