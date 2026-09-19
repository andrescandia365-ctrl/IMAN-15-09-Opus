import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  BOLETA_A,
  BOLETA_X,
  PERDIDA,
  QUE_NUMERO,
  avisosDeCosto,
  porUnidad,
  recordatorioBulto,
  recordatorioCosto,
  recordatorioEscaneoBulto,
  sospechaBulto,
} from "./costo-guia.ts";

describe("qué renglón de la boleta copiar", () => {
  it("depende de la factura del proveedor del rubro", () => {
    assert.match(recordatorioCosto("A"), /^Poné el SUBTOTAL por unidad/);
    assert.match(recordatorioCosto("X"), /^Poné el TOTAL que pagaste/);
    assert.match(recordatorioCosto(null), /como figura en la boleta/);
  });

  it("el link sirve para A y para X", () => {
    assert.equal(QUE_NUMERO, "¿Qué número de la boleta?");
  });

  it("un pack dice su número", () => {
    assert.equal(recordatorioBulto(6), "Este viene en bulto de 6. Dividí el costo del bulto por 6.");
  });

  it("escanear el bulto no dice que el costo es solo por unidad", () => {
    const t = recordatorioEscaneoBulto(6);
    assert.match(t, /bulto de 6/);
    assert.match(t, /del bulto o el de cada unidad/);
    assert.doesNotMatch(t, /POR UNIDAD/);
  });
});

describe("la cuenta del bulto", () => {
  it("redondea al peso más cercano", () => {
    assert.equal(porUnidad(10216, 6), 1703); // 1.702,67
    assert.equal(porUnidad(12158, 6), 2026); // 2.026,33
    assert.equal(porUnidad(1000, 1), 1000);
  });

  it("la boleta de ejemplo cierra y da lo mismo que la calculadora", () => {
    assert.equal(BOLETA_A.neto + BOLETA_A.internos, BOLETA_A.subtotal);
    assert.equal(Math.round(BOLETA_A.subtotal * 0.21), BOLETA_A.iva);
    assert.equal(BOLETA_A.subtotal + BOLETA_A.iva, BOLETA_A.total);
    assert.equal(porUnidad(BOLETA_A.subtotal, BOLETA_A.unidades), 1703);
    assert.equal(porUnidad(BOLETA_X.total, BOLETA_X.unidades), 2026);
  });
});

describe("avisos cuando el costo no tiene sentido", () => {
  const base = { costoAntes: 1000, precioNuevo: 1500, bulto: 6, desdeBulto: false };

  it("un costo normal no avisa nada", () => {
    assert.deepEqual(avisosDeCosto({ ...base, costo: 1150 }), []);
  });

  it("si el precio nuevo no cubre el costo: a pérdida", () => {
    assert.deepEqual(avisosDeCosto({ ...base, bulto: 1, costo: 1600, precioNuevo: 1500 }), [PERDIDA]);
  });

  it("si el precio nuevo cubre, no grita pérdida aunque el de hoy quede abajo", () => {
    assert.deepEqual(avisosDeCosto({ ...base, bulto: 1, costo: 1600, precioNuevo: 2400 }), []);
  });

  it("el bulto entero en el costo por unidad: sospecha, con el tamaño del bulto", () => {
    // El margen ya subió el precio nuevo: no es pérdida, es el bulto.
    assert.deepEqual(avisosDeCosto({ ...base, costo: 6300, precioNuevo: 9400 }), [sospechaBulto(6)]);
    // Sin precio nuevo todavía, queda la del bulto sola.
    assert.deepEqual(avisosDeCosto({ ...base, precioNuevo: 0, costo: 5200 }), [sospechaBulto(6)]);
  });

  it("no sospecha si salió de la calculadora de bulto, ni sin costo anterior, ni lejos del bulto", () => {
    assert.deepEqual(avisosDeCosto({ ...base, precioNuevo: 0, costo: 6000, desdeBulto: true }), []);
    assert.deepEqual(avisosDeCosto({ ...base, precioNuevo: 0, costo: 6000, costoAntes: null }), []);
    assert.deepEqual(avisosDeCosto({ ...base, precioNuevo: 0, costo: 3000 }), []);
  });
});
