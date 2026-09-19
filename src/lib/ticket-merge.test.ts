import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mergeTicketLines } from "./ticket-merge.ts";
import type { TicketLine } from "./types.ts";

const linea = (productId: string, qty: number, price: number): TicketLine => ({
  productId,
  name: productId,
  barcode: `779${productId}`,
  price,
  qty,
});

describe("sumar el ticket del celu al que está en el mostrador", () => {
  it("el mismo producto suma cantidad y queda con el precio que ya tenía", () => {
    const r = mergeTicketLines([linea("coca", 1, 1800)], [linea("coca", 2, 1700)]);
    assert.deepEqual(r, [linea("coca", 3, 1800)]);
  });

  it("lo que no estaba entra al final, como vino", () => {
    const r = mergeTicketLines([linea("coca", 1, 1800)], [linea("alfajor", 2, 800)]);
    assert.deepEqual(r, [linea("coca", 1, 1800), linea("alfajor", 2, 800)]);
  });

  it("no toca el ticket de antes", () => {
    const antes = [linea("coca", 1, 1800)];
    mergeTicketLines(antes, [linea("coca", 5, 1800)]);
    assert.equal(antes[0]?.qty, 1);
  });
});
