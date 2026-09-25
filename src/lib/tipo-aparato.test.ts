import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describirCaja, esTipoAparato, tipoPorPantalla } from "./tipo-aparato.ts";

describe("tipoPorPantalla", () => {
  it("con mouse es una computadora, aunque la pantalla sea chica", () => {
    assert.equal(tipoPorPantalla(false, 400), "computadora");
  });
  it("táctil y angosta es un celu; táctil y ancha, una tablet", () => {
    assert.equal(tipoPorPantalla(true, 393), "celu");
    assert.equal(tipoPorPantalla(true, 800), "tablet");
  });
});

describe("describirCaja", () => {
  const ahora = new Date(2026, 8, 25, 12, 0);
  it("otro aparato con tipo, desde hoy", () => {
    const t = describirCaja({ esEste: false, tipo: "celu", desde: new Date(2026, 8, 25, 9, 5).toISOString() }, ahora);
    assert.match(t, /^un celular, desde hoy a las 09:05/);
  });
  it("este aparato, desde ayer", () => {
    const t = describirCaja({ esEste: true, tipo: "computadora", desde: new Date(2026, 8, 24, 18, 30).toISOString() }, ahora);
    assert.match(t, /^este aparato \(computadora\), desde ayer a las 18:30/);
  });
  it("de antes, sin tipo: otro aparato, con el día de la semana", () => {
    const t = describirCaja({ esEste: false, tipo: null, desde: new Date(2026, 8, 21, 10, 0).toISOString() }, ahora);
    assert.match(t, /^otro aparato, desde el lunes 21\/09 a las 10:00/);
  });
  it("sin fecha: solo el aparato", () => {
    assert.equal(describirCaja({ esEste: false, tipo: "tablet", desde: null }, ahora), "una tablet");
  });
});

describe("esTipoAparato", () => {
  it("solo los tres tipos", () => {
    assert.equal(esTipoAparato("celu"), true);
    assert.equal(esTipoAparato("pc"), false);
    assert.equal(esTipoAparato(null), false);
  });
});
