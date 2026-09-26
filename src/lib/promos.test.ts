import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aplicarPromo, cartelesPorSacar, cobrar, juntarPromos, marcaDePromo, promoDeVenta, vigente } from "./promos.ts";
import type { Promo, TicketLine } from "./types.ts";

const HOY = "2026-09-25";

function linea(productId: string, price: number, qty: number): TicketLine {
  return { productId, name: productId, barcode: productId, price, qty };
}

function promo(over: Partial<Promo> & Pick<Promo, "id" | "kind" | "items" | "price">): Promo {
  return {
    name: over.id,
    from: "2026-09-20",
    until: "2026-09-30",
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    ...over,
  };
}

const sumaItems = (c: ReturnType<typeof cobrar>) => c.items.reduce((a, it) => a + it.price * it.qty, 0);

describe("vigente", () => {
  const p = promo({ id: "o", kind: "oferta", items: [{ productId: "alfajor", qty: 1 }], price: 800 });
  it("de from a until, los dos días incluidos", () => {
    assert.equal(vigente(p, "2026-09-19"), false);
    assert.equal(vigente(p, "2026-09-20"), true);
    assert.equal(vigente(p, "2026-09-30"), true);
    assert.equal(vigente(p, "2026-10-01"), false);
  });
  it("terminada a mano no está vigente", () => {
    assert.equal(vigente({ ...p, endedAt: "2026-09-22T10:00:00.000Z" }, HOY), false);
  });
});

describe("cobrar", () => {
  it("sin promos: el precio de góndola", () => {
    const c = cobrar([linea("alfajor", 1000, 2)], [], HOY);
    assert.equal(c.total, 2000);
    assert.equal(c.ahorro, 0);
    assert.equal(c.items[0]?.promoId, undefined);
  });

  it("oferta: todas las unidades al precio de oferta, anotada en el renglón", () => {
    const p = promo({ id: "of", kind: "oferta", items: [{ productId: "alfajor", qty: 1 }], price: 800 });
    const c = cobrar([linea("alfajor", 1000, 3), linea("coca", 3000, 1)], [p], HOY);
    assert.equal(c.total, 3 * 800 + 3000);
    assert.equal(c.ahorro, 600);
    assert.deepEqual(c.items[0], {
      productId: "alfajor",
      name: "alfajor",
      qty: 3,
      price: 800,
      listPrice: 1000,
      promoId: "of",
      promoQty: 3,
      promoKind: "oferta",
    });
    assert.equal(c.items[1]?.promoId, undefined);
    assert.deepEqual(c.aplicadas, [{ promoId: "of", name: "of", kind: "oferta", veces: 3, ahorro: 600 }]);
  });

  it("vencida: vuelve el precio de góndola sola", () => {
    const p = promo({ id: "of", kind: "liquidacion", items: [{ productId: "yogur", qty: 1 }], price: 500, until: "2026-09-24" });
    assert.equal(cobrar([linea("yogur", 900, 1)], [p], HOY).total, 900);
  });

  it("una oferta que ya no abarata (la góndola bajó) no se aplica: nunca cobra más", () => {
    const p = promo({ id: "of", kind: "oferta", items: [{ productId: "alfajor", qty: 1 }], price: 1200 });
    const c = cobrar([linea("alfajor", 1000, 1)], [p], HOY);
    assert.equal(c.total, 1000);
    assert.equal(c.items[0]?.promoId, undefined);
  });

  it("2x1 con tres unidades: dos en promo y una suelta, en un solo renglón", () => {
    const p = promo({ id: "dos", kind: "2x1", items: [{ productId: "coca", qty: 2 }], price: 3000 });
    const c = cobrar([linea("coca", 3000, 3)], [p], HOY);
    assert.equal(c.total, 6000);
    assert.equal(c.ahorro, 3000);
    assert.equal(c.items.length, 1);
    assert.equal(c.items[0]?.qty, 3);
    assert.equal(c.items[0]?.price, 2000);
    assert.equal(c.items[0]?.promoId, "dos");
    assert.equal(c.items[0]?.promoQty, 2);
    // El renglón dice "2x1": así se entiende el precio promedio.
    assert.equal(marcaDePromo(c.items[0]!), "2x1");
    // En promo se cobraron los 2 del 2x1 (3000), no la tercera suelta.
    assert.deepEqual(promoDeVenta({ items: c.items }), { total: 3000, ahorro: 3000 });
  });

  it("combo: se cobra el precio del combo y se reparte entre los productos, sin perder un peso", () => {
    const p = promo({
      id: "merienda",
      kind: "combo",
      items: [
        { productId: "alfajor", qty: 1 },
        { productId: "chocolatada", qty: 1 },
      ],
      price: 2500,
    });
    const c = cobrar([linea("alfajor", 1000, 1), linea("chocolatada", 2000, 1)], [p], HOY);
    assert.equal(c.total, 2500);
    assert.equal(sumaItems(c), 2500);
    assert.equal(c.ahorro, 500);
    // El alfajor pesa un tercio: 833 enteros; la chocolatada, el resto.
    assert.equal(c.items.find((i) => i.productId === "alfajor")?.price, 833);
    assert.equal(c.items.find((i) => i.productId === "chocolatada")?.price, 1667);
    assert.ok(c.items.every((i) => i.promoId === "merienda"));
  });

  it("combo incompleto no se aplica; dos combos completos, dos veces", () => {
    const p = promo({
      id: "m",
      kind: "combo",
      items: [
        { productId: "a", qty: 1 },
        { productId: "b", qty: 1 },
      ],
      price: 2500,
    });
    assert.equal(cobrar([linea("a", 1000, 2)], [p], HOY).total, 2000);
    const dos = cobrar([linea("a", 1000, 2), linea("b", 2000, 3)], [p], HOY);
    assert.equal(dos.total, 2 * 2500 + 2000);
    assert.equal(dos.aplicadas[0]?.veces, 2);
  });

  it("el mismo producto en un combo y en oferta: primero el combo, la oferta sobre lo que queda", () => {
    const combo = promo({
      id: "c",
      kind: "combo",
      items: [
        { productId: "a", qty: 1 },
        { productId: "b", qty: 1 },
      ],
      price: 2000,
    });
    const oferta = promo({ id: "o", kind: "oferta", items: [{ productId: "a", qty: 1 }], price: 700 });
    const c = cobrar([linea("a", 1000, 2), linea("b", 2000, 1)], [combo, oferta], HOY);
    assert.equal(c.total, 2000 + 700);
  });

  it("el mismo producto en dos renglones se junta en uno", () => {
    const c = cobrar([linea("a", 1000, 1), linea("a", 1000, 2)], [], HOY);
    assert.equal(c.items.length, 1);
    assert.equal(c.items[0]?.qty, 3);
  });
});

describe("promoDeVenta", () => {
  it("suma lo cobrado en promo y lo descontado", () => {
    const p = promo({ id: "of", kind: "oferta", items: [{ productId: "a", qty: 1 }], price: 800 });
    const c = cobrar([linea("a", 1000, 2), linea("b", 500, 1)], [p], HOY);
    assert.deepEqual(promoDeVenta({ items: c.items.map((i) => ({ ...i })) }), { total: 1600, ahorro: 400 });
  });
});

describe("carteles por sacar", () => {
  const base = promo({ id: "o", kind: "oferta", items: [{ productId: "a", qty: 1 }], price: 800 });
  it("vencida o terminada a mano, hasta que alguien confirma que lo sacó", () => {
    assert.equal(cartelesPorSacar([base], HOY).length, 0);
    assert.equal(cartelesPorSacar([{ ...base, until: "2026-09-24" }], HOY).length, 1);
    assert.equal(cartelesPorSacar([{ ...base, endedAt: "2026-09-25T10:00:00.000Z" }], HOY).length, 1);
    assert.equal(cartelesPorSacar([{ ...base, until: "2026-09-24", retiradaAt: "2026-09-25T09:00:00.000Z" }], HOY).length, 0);
  });
});

describe("promos entre dos aparatos", () => {
  const p = promo({ id: "o", kind: "oferta", items: [{ productId: "a", qty: 1 }], price: 800 });
  it("el evento entra, y una versión vieja no pisa a una nueva", () => {
    const una = aplicarPromo([], { promo: p })!;
    assert.equal(una.length, 1);
    const nueva = { ...p, price: 700, updatedAt: "2026-09-21T10:00:00.000Z" };
    const dos = aplicarPromo(una, { promo: nueva })!;
    assert.equal(dos[0]?.price, 700);
    assert.equal(aplicarPromo(dos, { promo: p }), null);
  });
  it("un evento mal formado no toca nada", () => {
    assert.equal(aplicarPromo([p], { promo: { id: "x" } }), null);
    assert.equal(aplicarPromo([p], null), null);
  });
  it("juntar dos copias: las de los dos lados, cada una en su versión más nueva", () => {
    const pc = [p, promo({ id: "pc", kind: "oferta", items: [{ productId: "b", qty: 1 }], price: 100 })];
    const celu = [
      { ...p, endedAt: "2026-09-22T10:00:00.000Z", updatedAt: "2026-09-22T10:00:00.000Z" },
      promo({ id: "celu", kind: "2x1", items: [{ productId: "c", qty: 2 }], price: 900 }),
    ];
    const juntas = juntarPromos(pc, celu);
    assert.deepEqual(juntas.map((x) => x.id).sort(), ["celu", "o", "pc"]);
    assert.equal(juntas.find((x) => x.id === "o")?.endedAt, "2026-09-22T10:00:00.000Z");
    assert.deepEqual(juntarPromos(celu, pc).map((x) => x.id).sort(), ["celu", "o", "pc"]);
    assert.equal(juntarPromos(celu, pc).find((x) => x.id === "o")?.endedAt, "2026-09-22T10:00:00.000Z");
  });
});
