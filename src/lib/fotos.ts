import { useEffect, useState } from "react";

/**
 * Las fotos de los productos, para los carteles. Quedan SOLO en este aparato:
 * una base aparte (`iman-fotos`), no en la copia del local ni en la cinta, así
 * no inflan la fotocopia ni se suben. Si Chrome borra los datos del sitio, se
 * pierden: se vuelven a sacar.
 *
 * Se guardan cuadradas, recortadas al centro, de 800 px como mucho, en JPEG:
 * alcanza para ~10 cm en A4 y para la imagen de WhatsApp, y pesa ~100 KB.
 */

const DB = "iman-fotos";
const STORE = "fotos";
const EVENTO = "iman-foto";
export const FOTO_LADO = 800;

type Guardada = { blob: Blob; updatedAt: string };

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const clave = (storeId: string, productId: string) => `${storeId}:${productId}`;

async function conStore<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, modo);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function leerFoto(storeId: string, productId: string): Promise<Blob | null> {
  if (typeof indexedDB === "undefined" || !storeId || !productId) return null;
  const v = (await conStore("readonly", (s) => s.get(clave(storeId, productId)))) as Guardada | undefined;
  return v?.blob ?? null;
}

export async function guardarFoto(storeId: string, productId: string, blob: Blob): Promise<void> {
  const v: Guardada = { blob, updatedAt: new Date().toISOString() };
  await conStore("readwrite", (s) => s.put(v, clave(storeId, productId)));
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: clave(storeId, productId) }));
}

export async function borrarFoto(storeId: string, productId: string): Promise<void> {
  await conStore("readwrite", (s) => s.delete(clave(storeId, productId)));
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: clave(storeId, productId) }));
}

/** El lado y el punto de arranque del recorte cuadrado al centro. Puro, con test. */
export function recorteCuadrado(ancho: number, alto: number, max = FOTO_LADO): { sx: number; sy: number; lado: number; salida: number } {
  const lado = Math.min(ancho, alto);
  return {
    sx: Math.round((ancho - lado) / 2),
    sy: Math.round((alto - lado) / 2),
    lado,
    salida: Math.min(lado, max),
  };
}

/**
 * La foto de la cámara o de un archivo, recortada sola al cuadrado del centro,
 * derecha (respeta la orientación del celu) y achicada. Fondo blanco: un PNG
 * con transparencia no queda negro en el JPEG.
 */
export async function prepararFoto(archivo: Blob): Promise<Blob> {
  const img = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  const { sx, sy, lado, salida } = recorteCuadrado(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = salida;
  canvas.height = salida;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la foto");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, salida, salida);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, lado, lado, 0, 0, salida, salida);
  img.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("No se pudo preparar la foto");
  return blob;
}

/** La foto del producto como URL para un <img>, o null. Se entera si cambia. */
export function useFoto(storeId: string, productId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!storeId || !productId) {
      setUrl(null);
      return;
    }
    let vivo = true;
    let actual: string | null = null;
    const cargar = () => {
      void leerFoto(storeId, productId)
        .then((blob) => {
          if (!vivo) return;
          if (actual) URL.revokeObjectURL(actual);
          actual = blob ? URL.createObjectURL(blob) : null;
          setUrl(actual);
        })
        .catch(() => {
          if (vivo) setUrl(null);
        });
    };
    cargar();
    const onCambio = (e: Event) => {
      if ((e as CustomEvent<string>).detail === clave(storeId, productId)) cargar();
    };
    window.addEventListener(EVENTO, onCambio);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO, onCambio);
      if (actual) URL.revokeObjectURL(actual);
    };
  }, [storeId, productId]);
  return url;
}
