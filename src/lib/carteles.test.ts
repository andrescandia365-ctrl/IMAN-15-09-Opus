import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ajustar, cartelSvg, historiaSvg, PALETAS, type CartelDatos } from "./carteles.ts";

// Un medidor de mentira: cada letra ocupa 0,55 del alto.
const medir = (t: string, px: number) => t.length * px * 0.55;
const color = { paleta: PALETAS[0]!, ahorro: false, familia: "X" };
const tinta = { ...color, ahorro: true };
const svg = (d: CartelDatos, e = color) => cartelSvg(d, e, medir, { ancho: "210mm", alto: "297mm" });

describe("ajustar", () => {
  it("baja el tamaño hasta que entra en los renglones pedidos", () => {
    const r = ajustar("Alfajor Havanna chocolate", 400, 1, 200, 20, medir);
    assert.equal(r.lineas.length, 1);
    assert.ok(medir(r.lineas[0]!, r.tam) <= 400);
  });
  it("corta en renglones por palabras antes de achicar de más", () => {
    const r = ajustar("uno dos tres cuatro", 300, 3, 100, 20, medir);
    assert.ok(r.lineas.length > 1);
    assert.ok(r.lineas.every((l) => medir(l, r.tam) <= 300));
  });
  it("si ni al mínimo entra, corta con puntos suspensivos", () => {
    const r = ajustar("Supercalifragilísticoespialidoso", 100, 1, 50, 40, medir);
    assert.ok(r.lineas[0]!.endsWith("…"));
  });
});

describe("cartel", () => {
  const oferta: CartelDatos = {
    plantilla: "oferta",
    productos: [{ nombre: "Alfajor Havanna", precio: 2500 }],
    precio: 2000,
    hasta: "2026-09-30",
    agotar: true,
  };
  it("oferta: el precio de la promo, el de antes, y la validez", () => {
    const s = svg(oferta);
    assert.match(s, /\$2\.000/);
    assert.match(s, /ANTES \$2\.500/);
    assert.match(s, /VÁLIDO HASTA EL 30\/09 · HASTA AGOTAR STOCK/);
    assert.match(s, /OFERTA/);
  });
  it("'hasta agotar stock' solo si se pidió", () => {
    assert.doesNotMatch(svg({ ...oferta, agotar: false }), /AGOTAR/);
  });
  it("precio grande: el precio de góndola, sin validez", () => {
    const s = svg({ plantilla: "precio", productos: [{ nombre: "Coca-Cola 2.25 L", precio: 3200 }] });
    assert.match(s, /\$3\.200/);
    assert.doesNotMatch(s, /VÁLIDO/);
  });
  it("combo: el precio del combo y el de antes, la suma de los productos", () => {
    const s = svg({
      plantilla: "combo",
      productos: [
        { nombre: "Alfajor", precio: 800 },
        { nombre: "Coca 500", precio: 1800 },
      ],
      precio: 2200,
      hasta: "2026-09-30",
    });
    assert.match(s, /\$2\.200/);
    assert.match(s, /ANTES \$2\.600/);
    assert.match(s, /EL COMBO/);
  });
  it("ahorro de tinta: fondo blanco, sin rayos", () => {
    const conRayos = svg(oferta);
    const sinRayos = svg(oferta, tinta);
    assert.match(conRayos, new RegExp(`fill="${PALETAS[0]!.rayo}"`));
    assert.doesNotMatch(sinRayos, new RegExp(`fill="${PALETAS[0]!.rayo}"`));
    assert.match(sinRayos, /<rect width="1000" height="1414" fill="#FFFFFF"\/>/);
  });
  it("el texto del kiosquero va escapado", () => {
    const s = svg({ plantilla: "aviso", productos: [], titulo: "<b>", texto: "Tom & Jerry" });
    assert.doesNotMatch(s, /<b>/);
    assert.match(s, /&amp;/);
  });
  it("todos los atributos separados: el SVG tiene que ser XML estricto para pasarlo a imagen", () => {
    const todos = [svg(oferta), svg(oferta, tinta), historiaSvg(oferta, color, medir, "Kiosco")];
    for (const s of todos) assert.doesNotMatch(s, /"[a-z-]+=/i, "hay un atributo pegado al anterior");
  });
  it("la historia lleva el nombre del kiosco", () => {
    assert.match(historiaSvg(oferta, color, medir, "Kiosco Lo de Tito"), /KIOSCO LO DE TITO/);
  });
});
