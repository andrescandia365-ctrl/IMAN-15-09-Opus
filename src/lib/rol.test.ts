import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cajaMasNueva, puedeCobrar, rolDe } from "./rol.ts";

describe("rolDe", () => {
  it("sin caja anotada, el local sigue como hoy", () => {
    assert.equal(rolDe(null, "a"), "sin-asignar");
    assert.equal(rolDe({ device: null, ver: 0 }, "a"), "sin-asignar");
  });
  it("la caja es este aparato o es otro", () => {
    assert.equal(rolDe({ device: "a", ver: 1 }, "a"), "caja");
    assert.equal(rolDe({ device: "b", ver: 1 }, "a"), "piso");
  });
});

describe("puedeCobrar", () => {
  it("sin caja anotada decide la pantalla, como hoy", () => {
    assert.equal(puedeCobrar("sin-asignar", false), true);
    assert.equal(puedeCobrar("sin-asignar", true), false);
  });
  it("con caja anotada decide el rol, no la pantalla", () => {
    assert.equal(puedeCobrar("caja", true), true);
    assert.equal(puedeCobrar("piso", false), false);
  });
});

describe("cajaMasNueva", () => {
  it("una respuesta vieja que llega tarde no devuelve la caja", () => {
    const sabida = { device: "b", ver: 3 };
    assert.deepEqual(cajaMasNueva(sabida, { device: "a", ver: 2 }), sabida);
    assert.deepEqual(cajaMasNueva(sabida, { device: "a", ver: 4 }), { device: "a", ver: 4 });
  });
  it("sin nada que llegue, queda lo sabido", () => {
    assert.deepEqual(cajaMasNueva({ device: "a", ver: 1 }, null), { device: "a", ver: 1 });
    assert.equal(cajaMasNueva(null, undefined), null);
  });
});
