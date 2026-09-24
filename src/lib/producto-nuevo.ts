import type { Product } from "@/lib/types";
import { uid } from "@/lib/utils";

/**
 * El borrador de un alta rápida: el código y nada más. El rubro va vacío a
 * propósito: decide el margen y la factura, y uno puesto de antemano se acepta
 * sin mirar.
 */
export function productoNuevo(barcode: string): Product {
  return {
    id: uid("p"),
    name: "",
    barcode,
    price: 0,
    cost: null,
    stock: 0,
    stockMin: 0,
    packQty: 1,
    packBarcode: "",
    categoryId: "",
    active: true,
    expiresAt: null,
    priceUpdatedAt: new Date().toISOString(),
    onOffer: false,
  };
}

const ULTIMO_RUBRO = "iman-ultimo-rubro";

/** El rubro del último alta en este aparato: va primero en la fila, sin marcar. */
export function ultimoRubro(): string {
  try {
    return window.localStorage.getItem(ULTIMO_RUBRO) ?? "";
  } catch {
    return "";
  }
}

export function recordarRubro(categoryId: string): void {
  try {
    window.localStorage.setItem(ULTIMO_RUBRO, categoryId);
  } catch {
    /* sin lugar */
  }
}
