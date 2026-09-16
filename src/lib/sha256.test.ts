import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { sha256Hex } from "./sha256.ts";

function nodeHash(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

function propio(texto: string): string {
  return sha256Hex(new TextEncoder().encode(texto));
}

test("coincide con el SHA-256 de referencia", () => {
  const casos = [
    "",
    "abc",
    "iman.dueno.v1:1234",
    "iman.dueno.v1:87654321",
    "ñandú y acentos áéíóú",
    "a".repeat(55), // justo antes del borde del bloque
    "a".repeat(56), // obliga a un bloque extra
    "a".repeat(63),
    "a".repeat(64),
    "a".repeat(200),
  ];
  for (const c of casos) {
    assert.equal(propio(c), nodeHash(c), `no coincide para ${JSON.stringify(c.slice(0, 24))}`);
  }
});

test("la clave del dueño da lo mismo con y sin WebCrypto", async () => {
  const pin = "1234";
  const texto = `iman.dueno.v1:${pin}`;
  const conWebCrypto = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)),
  ).toString("hex");
  assert.equal(propio(texto), conWebCrypto);
});
