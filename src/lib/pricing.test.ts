import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasFactor, invoiceForProduct, isBigPriceJump, shelfInvoice } from "./pricing.ts";
import type { Category, Product, Settings, Supplier } from "./types.ts";

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

describe("shelfInvoice", () => {
  it("uses the Fac of the supplier that brings the rubro", () => {
    const suppliers = [{ id: "s2", name: "Otro", categoryIds: ["beb"], invoiceType: "A" }] as Supplier[];
    assert.equal(shelfInvoice(p, suppliers), "A");
  });

  it("falls back to X when nobody with Fac brings it", () => {
    assert.equal(shelfInvoice(p, []), "X");
  });
});

describe("hasFactor", () => {
  const settings = { priceMarkups: { raro: 1.4 } } as unknown as Settings;

  it("accepts a markup the owner stored", () => {
    assert.equal(hasFactor({ id: "raro", name: "Raro", sort: 0 } as Category, "X", settings), true);
  });

  it("accepts a known rubro without a stored markup", () => {
    assert.equal(hasFactor({ id: "b", name: "Bebidas", sort: 0 } as Category, "A", settings), true);
  });

  it("rejects a rubro nobody gave a markup", () => {
    assert.equal(hasFactor({ id: "x", name: "Ferretería", sort: 0 } as Category, "X", settings), false);
  });
});

describe("isBigPriceJump", () => {
  it("lets 40% through and asks past it", () => {
    assert.equal(isBigPriceJump(1000, 1400), false);
    assert.equal(isBigPriceJump(1000, 600), false);
    assert.equal(isBigPriceJump(1000, 1500), true);
    assert.equal(isBigPriceJump(1000, 500), true);
  });

  it("does not ask when there was no price before", () => {
    assert.equal(isBigPriceJump(0, 5000), false);
  });
});
