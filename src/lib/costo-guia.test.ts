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
    assert.equal(recordatorioBulto(6), "Este viene en bulto de 6. Poné el costo del bulto.");
  });

  it("escanear el bulto y el campo dicen lo mismo", () => {
    const t = recordatorioEscaneoBulto(6);
    assert.match(t, /bulto de 6/);
    assert.match(t, /costo del bulto/);
    assert.doesNotMatch(t, /POR UNIDAD/);
    assert.doesNotMatch(t, /cada unidad/);
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

  it("no sospecha si salió de la calculadora de bulto, ni lejos del bulto", () => {
    assert.deepEqual(avisosDeCosto({ ...base, precioNuevo: 0, costo: 6000, desdeBulto: true }), []);
    assert.deepEqual(avisosDeCosto({ ...base, precioNuevo: 0, costo: 3000 }), []);
  });

  it("sin costo anterior y sin precio de góndola no hay escala: no avisa", () => {
    assert.deepEqual(avisosDeCosto({ ...base, precioNuevo: 0, costo: 6000, costoAntes: null }), []);
  });

  it("primera carga: el total del remito en el costo por unidad avisa, no bloquea", () => {
    assert.deepEqual(
      avisosDeCosto({
        costo: 10216,
        costoAntes: null,
        precioNuevo: 15400,
        precioHoy: 3100,
        bulto: 6,
        desdeBulto: false,
      }),
      [sospechaBulto(6)],
    );
    assert.deepEqual(
      avisosDeCosto({
        costo: 12158,
        costoAntes: null,
        precioNuevo: 18000,
        precioHoy: 3100,
        bulto: 6,
        desdeBulto: false,
      }),
      [sospechaBulto(6)],
    );
  });

  it("primera carga: cerca de packQty veces un costo razonable avisa", () => {
    // Góndola 3100 → unidad razonable ~1550 → bulto de 6 ~9300.
    assert.deepEqual(
      avisosDeCosto({
        costo: 9300,
        costoAntes: null,
        precioNuevo: 14000,
        precioHoy: 3100,
        bulto: 6,
        desdeBulto: false,
      }),
      [sospechaBulto(6)],
    );
  });

  it("primera carga: un costo de unidad razonable no avisa", () => {
    assert.deepEqual(
      avisosDeCosto({
        costo: 1703,
        costoAntes: null,
        precioNuevo: 3100,
        precioHoy: 3100,
        bulto: 6,
        desdeBulto: false,
      }),
      [],
    );
  });

  it("primera carga desde la calculadora de bulto no avisa", () => {
    assert.deepEqual(
      avisosDeCosto({
        costo: 1703,
        costoAntes: null,
        precioNuevo: 3100,
        precioHoy: 3100,
        bulto: 6,
        desdeBulto: true,
      }),
      [],
    );
  });
});
