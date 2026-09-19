import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { margenDelMes } from "./mes.ts";
import { netOfGross, stripsShelfTax } from "./fiscal.ts";
import type { Settings } from "./types.ts";

const base: Settings = { name: "Faro", city: "Rosario", onboarded: true } as Settings;

function settings(over: Partial<Settings>): Settings {
  return { ...base, ...over };
}

describe("la cuenta del mes según cómo facturás", () => {
  const plata = {
    ventas: 121_000,
    devuelto: 0,
    costo: 50_000,
    devueltoCosto: 0,
    comision: 0,
    gastos: 0,
    retiros: 10_000,
  };

  it("responsable inscripto da menos margen que monotributo con los mismos pesos Fac A", () => {
    const ri = margenDelMes({
      ...plata,
      settings: settings({
        fiscalCondition: "responsable_inscripto",
        taxName: "IVA",
        taxPct: 21,
        shelfIncludesTax: true,
      }),
    });
    const mono = margenDelMes({
      ...plata,
      settings: settings({ fiscalCondition: "monotributo", taxPct: 21, shelfIncludesTax: true }),
    });
    assert.equal(mono.ventasNetas, 121_000);
    assert.equal(mono.margen, 71_000);
    assert.equal(ri.ventasNetas, 100_000);
    assert.equal(ri.margen, 50_000);
    assert.ok(ri.margen < mono.margen);
    assert.equal(ri.quedo, 40_000);
    assert.equal(mono.quedo, 61_000);
    assert.equal(ri.etiquetaMargen, "Margen del negocio");
    assert.equal(mono.etiquetaMargen, "Margen del negocio");
  });

  it("monotributo y en negro calculan igual y se guardan aparte", () => {
    const mono = margenDelMes({ ...plata, settings: settings({ fiscalCondition: "monotributo" }) });
    const negro = margenDelMes({ ...plata, settings: settings({ fiscalCondition: "en_negro" }) });
    assert.equal(mono.margen, negro.margen);
    assert.equal(mono.ventasNetas, negro.ventasNetas);
    assert.notEqual(mono.condicion, negro.condicion);
    assert.equal(negro.etiquetaVentas, "Lo que entró");
    assert.equal(negro.etiquetaMargen, "Lo que sobró");
    assert.equal(mono.etiquetaVentas, "Ventas del mes");
  });

  it("la tasa sale del local: no hay un 21 fijo en la cuenta", () => {
    const igv = margenDelMes({
      ...plata,
      ventas: 118_000,
      settings: settings({
        fiscalCondition: "responsable_inscripto",
        taxName: "IGV",
        taxPct: 18,
        shelfIncludesTax: true,
      }),
    });
    assert.equal(igv.ventasNetas, 100_000);
    assert.equal(igv.etiquetaSinImpuesto, "Sin el IGV");
    assert.equal(netOfGross(121_000, settings({ fiscalCondition: "responsable_inscripto" })), 121_000);
  });

  it("si la góndola no trae el impuesto, el RI no lo saca de las ventas", () => {
    const s = settings({
      fiscalCondition: "responsable_inscripto",
      taxPct: 21,
      shelfIncludesTax: false,
    });
    assert.equal(stripsShelfTax(s), false);
    const r = margenDelMes({ ...plata, settings: s });
    assert.equal(r.margen, 71_000);
  });
});
