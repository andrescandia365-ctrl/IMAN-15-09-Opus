import type { Product } from "@/lib/types";
import { uid } from "@/lib/utils";

/** El borrador de un alta rápida: código y rubro, el resto lo completa el encargado. */
export function productoNuevo(barcode: string, categoryId: string): Product {
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
    categoryId,
    active: true,
    expiresAt: null,
    priceUpdatedAt: new Date().toISOString(),
    onOffer: false,
  };
}
