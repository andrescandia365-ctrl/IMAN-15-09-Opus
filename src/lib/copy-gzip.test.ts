import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { gzipSync } from "node:zlib";
import { encodeCopyPayload, GZIP_B64_MAX } from "./copy-gzip.ts";
import { gunzipB64ToJson } from "./copy-gzip.server.ts";

const mini = {
  products: [{ id: "p1", name: "Coca", barcode: "779", price: 100, cost: 60, stock: 4, stockMin: 1, categoryId: "beb", active: true, expiresAt: null, priceUpdatedAt: "2026-01-01T00:00:00.000Z" }],
  categories: [{ id: "beb", name: "Bebidas", sort: 1 }],
  sales: [],
  settings: { name: "Kiosco", city: "Rosario" },
  suppliers: [],
  shifts: [],
  drops: [],
  orders: [],
  movements: [],
  ticket: [],
  payMethod: "efectivo",
};

describe("fotocopia gzip", () => {
  it("el servidor infla lo que gzippea zlib (el aparato nuevo manda eso en base64)", () => {
    const b64 = gzipSync(JSON.stringify(mini), { level: 6 }).toString("base64");
    assert.deepEqual(gunzipB64ToJson(b64), mini);
  });

  it("un gzip trucho o vacío no pasa", () => {
    assert.throws(() => gunzipB64ToJson("%%%"), /Invalid kiosk payload/);
    assert.throws(() => gunzipB64ToJson(""), /Invalid kiosk payload/);
    assert.throws(() => gunzipB64ToJson("a".repeat(GZIP_B64_MAX + 1)), /Invalid kiosk payload/);
  });

  it("si hay CompressionStream, encodeCopyPayload manda gzip y se puede inflar", async () => {
    const packed = await encodeCopyPayload(mini);
    if ("gzip" in packed) {
      assert.deepEqual(gunzipB64ToJson(packed.gzip), mini);
    } else {
      assert.deepEqual(packed.payload, mini);
    }
  });
});
