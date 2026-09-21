/**
 * Fotocopia al cable: gzip si el navegador sabe, si no JSON como siempre.
 * El servidor acepta las dos (ver copy-gzip.server.ts y saveKiosk).
 */

/** Tope del base64 gzip que se acepta (≈ 600 KB binarios). Abuso / zip bomb. */
export const GZIP_B64_MAX = 800_000;

export function canGzipCopy(): boolean {
  return typeof CompressionStream === "function";
}

function bytesToB64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

/**
 * Cuánto se le da al gzip antes de mandar JSON crudo. No es por lentitud: es
 * para que una corriente que no avanza no pueda dejar el respaldo colgado sin
 * que nadie se entere, que es justo lo que pasó (ver el comentario de abajo).
 */
export const GZIP_TIMEOUT_MS = 8_000;

/**
 * Comprime la fotocopia.
 *
 * **La corriente se consume mientras se escribe, no después.** `write()` de un
 * `CompressionStream` no resuelve hasta que alguien lee del otro lado: la
 * versión anterior hacía `await write` → `await close` → recién ahí leía, y se
 * trababa **siempre**, con 3 KB y con 300 KB, en cualquier navegador. Como
 * `saveBlob` la espera, el botón Sincronizar quedaba girando para siempre y
 * ninguna fotocopia subió durante dos días. `pipeThrough` + `Response` lee y
 * escribe a la vez, que es como esta API pide que se use.
 */
export async function gzipJsonToB64(json: string): Promise<string> {
  const comprimido = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(comprimido).arrayBuffer();
  return bytesToB64(new Uint8Array(buf));
}

/** Corre `fn`, y si tarda de más se rinde en lugar de esperar para siempre. */
async function conTope<T>(fn: () => Promise<T>, ms: number): Promise<T | null> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<null>((resolve) => {
        reloj = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (reloj) clearTimeout(reloj);
  }
}

/**
 * Lo que saveKiosk entiende: JSON crudo (aparato viejo) o gzip en base64
 * (nuevo). Ante cualquier duda manda crudo: pesa más pero llega. Nunca se
 * queda esperando.
 */
export async function encodeCopyPayload<T>(payload: T): Promise<{ payload: T } | { gzip: string }> {
  if (!canGzipCopy()) return { payload };
  try {
    const gzip = await conTope(() => gzipJsonToB64(JSON.stringify(payload)), GZIP_TIMEOUT_MS);
    if (gzip == null || gzip.length > GZIP_B64_MAX) return { payload };
    return { gzip };
  } catch {
    return { payload };
  }
}
