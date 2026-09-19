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
  return `Este viene en bulto de ${n}. Dividí el costo del bulto por ${n}.`;
}

/** Al escanear el código del bulto: hay campo de bulto, no digas que el costo es solo por unidad. */
export function recordatorioEscaneoBulto(n: number): string {
  return `Escaneaste el bulto de ${n}. Podés poner el del bulto o el de cada unidad.`;
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
 * Avisos sobre un costo que cargó el encargado. Son sospechas, no bloqueos:
 * se puede confirmar igual.
 * - Más caro que el precio NUEVO (margen + redondeo): a ese precio se vende a
 *   pérdida. Si el nuevo cubre, no avisa: el de góndola de hoy no cuenta.
 * - Más o menos el bulto entero comparado con el costo anterior (entre 0,7 y
 *   1,3 veces el tamaño del bulto): parece el costo del bulto. No aplica si
 *   el número salió de la calculadora de bulto, que ya dividió.
 */
export function avisosDeCosto(o: {
  costo: number;
  costoAntes: number | null;
  precioNuevo: number;
  bulto: number;
  desdeBulto: boolean;
}): string[] {
  const avisos: string[] = [];
  if (o.precioNuevo > 0 && o.costo > o.precioNuevo) avisos.push(PERDIDA);
  if (o.bulto > 1 && !o.desdeBulto && o.costoAntes != null && o.costoAntes > 0) {
    const veces = o.costo / o.costoAntes;
    if (Math.abs(veces / o.bulto - 1) <= 0.3) avisos.push(sospechaBulto(o.bulto));
  }
  return avisos;
}
