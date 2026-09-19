/**
 * La resta del mes. Se pide con el botón; no corre sola.
 * Responsable inscripto con góndola que ya trae impuesto: las ventas se
 * miran sin ese impuesto. Monotributo y en negro usan la plata que entró,
 * con etiqueta distinta. La tasa sale del local, no de un 21% fijo.
 */
import {
  etiquetaMargen,
  etiquetaSinImpuesto,
  etiquetaVentas,
  fiscalConditionOf,
  netOfGross,
  stripsShelfTax,
  taxNameOf,
  type FiscalCondition,
} from "./fiscal.ts";
import type { Settings } from "./types.ts";

export function margenDelMes(o: {
  ventas: number;
  devuelto: number;
  costo: number;
  devueltoCosto: number;
  comision: number;
  gastos: number;
  retiros: number;
  settings: Settings;
}): {
  ventasBrutas: number;
  ventasNetas: number;
  stripsTax: boolean;
  margen: number;
  quedo: number;
  condicion: FiscalCondition;
  etiquetaVentas: string;
  etiquetaMargen: string;
  etiquetaSinImpuesto: string;
} {
  const condicion = fiscalConditionOf(o.settings);
  const bruto = o.ventas - o.devuelto;
  const ventasNetas = netOfGross(bruto, o.settings);
  const margen = ventasNetas - o.costo + o.devueltoCosto - o.comision - o.gastos;
  return {
    ventasBrutas: o.ventas,
    ventasNetas,
    stripsTax: stripsShelfTax(o.settings),
    margen,
    quedo: margen - o.retiros,
    condicion,
    etiquetaVentas: etiquetaVentas(condicion),
    etiquetaMargen: etiquetaMargen(condicion),
    etiquetaSinImpuesto: etiquetaSinImpuesto(taxNameOf(o.settings)),
  };
}
