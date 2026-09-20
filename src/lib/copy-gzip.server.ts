import { gunzipSync } from "node:zlib";
import { MAX_JSON_BYTES } from "./cap.ts";
import { GZIP_B64_MAX } from "./copy-gzip.ts";

/**
 * Infla el gzip de la fotocopia. Solo servidor: node:zlib no viaja al celu.
 * El JSON inflado sigue midiendo contra MAX_JSON_BYTES (zip bomb).
 */
export function gunzipB64ToJson(b64: string): unknown {
  if (typeof b64 !== "string" || !b64 || b64.length > GZIP_B64_MAX) {
    throw new Error("Invalid kiosk payload");
  }
  let raw: Buffer;
  try {
    raw = gunzipSync(Buffer.from(b64, "base64"));
  } catch {
    throw new Error("Invalid kiosk payload");
  }
  if (raw.length > MAX_JSON_BYTES) {
    throw new Error("El local pesa demasiado. IMAN recorta el historial; si sigue así, bajá el catálogo.");
  }
  try {
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    throw new Error("Invalid kiosk payload");
  }
}
