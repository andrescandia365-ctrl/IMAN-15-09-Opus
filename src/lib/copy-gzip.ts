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

export async function gzipJsonToB64(json: string): Promise<string> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  await writer.write(new TextEncoder().encode(json));
  await writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return bytesToB64(new Uint8Array(buf));
}

/** Lo que saveKiosk entiende: JSON crudo (aparato viejo) o gzip en base64 (nuevo). */
export async function encodeCopyPayload<T>(payload: T): Promise<{ payload: T } | { gzip: string }> {
  if (!canGzipCopy()) return { payload };
  try {
    const gzip = await gzipJsonToB64(JSON.stringify(payload));
    if (gzip.length > GZIP_B64_MAX) return { payload };
    return { gzip };
  } catch {
    return { payload };
  }
}
