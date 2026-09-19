import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultFactor,
  hasFactor,
  invoiceForProduct,
  isBigPriceJump,
  marginPrice,
  misalignedProducts,
  repriceProducts,
  shelfInvoice,
} from "./pricing.ts";
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

describe("factores A en pantalla", () => {
  it("golosinas Fac A se sigue viendo 2,12 en Argentina, salido del margen × tasa", () => {
    assert.equal(defaultFactor("Golosinas", "A"), 2.12);
    assert.equal(defaultFactor("Bebidas", "A"), 1.8);
    const ar = { taxPct: 21, shelfIncludesTax: true } as Settings;
    assert.equal(defaultFactor("Golosinas", "A", ar), 2.12);
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

describe("margen del rubro y precios desalineados", () => {
  const gol = { id: "gol", name: "Golosinas", sort: 1 } as Category;
  const beb = { id: "beb", name: "Bebidas", sort: 2 } as Category;
  const fia = { id: "fia", name: "Fiambres", sort: 3 } as Category;
  const suppliers = [
    { id: "arcor", name: "Arcor", categoryIds: ["gol"], invoiceType: "X" },
    { id: "coca", name: "Coca", categoryIds: ["beb"], invoiceType: "A" },
  ] as Supplier[];
  const settings = {
    priceMarkups: { gol: 2.1, beb: 1.5 },
    priceMarkupsA: { gol: 2.12, beb: 1.8 },
    roundStep: 100,
    roundMode: "up",
  } as unknown as Settings;
  const prod = (id: string, categoryId: string, cost: number | null, price: number) =>
    ({ id, name: id, categoryId, cost, price, active: true }) as Product;

  it("usa la Fac del proveedor que trae el rubro", () => {
    // Golosinas la trae Arcor con Fac X: 1000 × 2,1 = 2100.
    assert.equal(marginPrice(prod("alfajor", "gol", 1000, 0), gol, suppliers, settings), 2100);
    // Bebidas la trae Coca con Fac A: 1000 × 1,8 = 1800, no 1500.
    assert.equal(marginPrice(prod("coca", "beb", 1000, 0), beb, suppliers, settings), 1800);
  });

  it("sin costo o sin margen no hay precio que alinear", () => {
    assert.equal(marginPrice(prod("x", "gol", null, 500), gol, suppliers, settings), null);
    // Fiambres no tiene margen cargado ni uno conocido: nunca se pone el precio al costo.
    assert.equal(marginPrice(prod("jamon", "fia", 1000, 1500), fia, suppliers, settings), null);
  });

  it("cuenta los desalineados del rubro y alinearlos los deja en cero", () => {
    const products = [
      prod("alfajor", "gol", 1000, 1900), // le toca 2100
      prod("chicle", "gol", 500, 1100), // 500 × 2,1 = 1050 → 1100: ya está
      prod("sugus", "gol", null, 900), // sin costo: no cuenta
      prod("coca", "beb", 1000, 1500), // otro rubro
    ];
    assert.deepEqual(
      misalignedProducts(products, gol, suppliers, settings).map((p) => p.id),
      ["alfajor"],
    );
    const r = repriceProducts(
      products,
      (p) => (p.categoryId === "gol" ? marginPrice(p, gol, suppliers, settings) : null),
      "2026-09-18T12:00:00.000Z",
    );
    assert.equal(r.changed.length, 1);
    assert.equal(misalignedProducts(r.products, gol, suppliers, settings).length, 0);
    assert.equal(misalignedProducts(r.products, beb, suppliers, settings).length, 1);
  });

  it("un rubro sin productos o sin margen no marca nada", () => {
    assert.equal(misalignedProducts([], gol, suppliers, settings).length, 0);
    assert.equal(misalignedProducts([prod("jamon", "fia", 1000, 1)], fia, suppliers, settings).length, 0);
  });
});
