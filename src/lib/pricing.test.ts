import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { invoiceForProduct } from "./pricing.ts";
import type { Product, Supplier } from "./types.ts";

const p = { id: "p6", name: "Coca", categoryId: "beb" } as Product;

describe("invoiceForProduct", () => {
  it("uses the supplier that brings the rubro", () => {
    const suppliers = [
      { id: "s1", name: "Omar", categoryIds: ["beb"], invoiceType: "X" },
      { id: "s2", name: "Otro", categoryIds: ["gol"], invoiceType: "A" },
    ] as Supplier[];
    const hit = invoiceForProduct(p, suppliers);
    assert.equal(hit?.supplier.name, "Omar");
    assert.equal(hit?.invoice, "X");
  });

  it("returns null when nobody with Fac brings that rubro", () => {
    const suppliers = [{ id: "s2", name: "Otro", categoryIds: ["gol"], invoiceType: "A" }] as Supplier[];
    assert.equal(invoiceForProduct(p, suppliers), null);
  });
});
