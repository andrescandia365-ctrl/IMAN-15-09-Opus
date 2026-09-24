import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crearLectorTeclado, crearPresencia, pausaEntreCuadros, recorteVisible } from "./escaneo.ts";

describe("crearPresencia", () => {
  it("la cámara quieta sobre un producto lo suma una vez", () => {
    const p = crearPresencia(3);
    const leidas = Array.from({ length: 10 }, () => p.cuadro(["779"])).flat();
    assert.deepEqual(leidas, ["779"]);
  });

  it("uno o dos cuadros perdidos no cuentan como otra pasada", () => {
    const p = crearPresencia(3);
    const cuadros = [["779"], [], ["779"], [], [], ["779"]];
    assert.deepEqual(cuadros.flatMap((c) => p.cuadro(c)), ["779"]);
  });

  it("dos iguales uno detrás del otro suman dos", () => {
    const p = crearPresencia(3);
    const cuadros = [["779"], ["779"], [], [], [], ["779"], ["779"]];
    assert.deepEqual(cuadros.flatMap((c) => p.cuadro(c)), ["779", "779"]);
  });

  it("dos distintos en el mismo cuadro suman los dos", () => {
    const p = crearPresencia(3);
    assert.deepEqual(p.cuadro(["779", "780"]), ["779", "780"]);
  });
});

describe("pausaEntreCuadros", () => {
  it("no baja de 100 ms y nunca espera menos de lo que tardó leer", () => {
    assert.equal(pausaEntreCuadros(20), 100);
    assert.equal(pausaEntreCuadros(180), 180);
  });
});

describe("recorteVisible", () => {
  it("una franja ancha sobre un video vertical mira la banda del medio", () => {
    const r = recorteVisible(720, 1280, 400, 160);
    assert.equal(r.ancho, 720);
    assert.equal(r.alto, 288);
    assert.equal(r.x, 0);
    assert.equal(r.y, 496);
  });
});

describe("crearLectorTeclado", () => {
  const tipear = (l: ReturnType<typeof crearLectorTeclado>, texto: string, desde: number, cada: number) => {
    let t = desde;
    let out: string | null = null;
    for (const ch of texto) {
      out = l.tecla(ch, t) ?? out;
      t += cada;
    }
    return { t, out };
  };

  it("un lector con Enter entrega el código entero", () => {
    const l = crearLectorTeclado();
    const { t } = tipear(l, "7793000100012", 0, 5);
    assert.equal(l.tecla("Enter", t), "7793000100012");
  });

  it("no hay coincidencia a mitad de escaneo: nada sale antes del final", () => {
    const l = crearLectorTeclado();
    const { out } = tipear(l, "7793000100012", 0, 5);
    assert.equal(out, null);
  });

  it("una persona tipeando no es un escaneo", () => {
    const l = crearLectorTeclado();
    const { t } = tipear(l, "7793", 0, 150);
    assert.equal(l.tecla("Enter", t), null);
  });

  it("un lector sin Enter termina cuando dejan de llegar teclas", () => {
    const l = crearLectorTeclado();
    const { t } = tipear(l, "77930001", 0, 5);
    assert.equal(l.fin(t), null);
    assert.equal(l.fin(t + 100), "77930001");
  });

  it("las teclas que no son caracteres no ensucian el código", () => {
    const l = crearLectorTeclado();
    l.tecla("Shift", 0);
    l.tecla("Unidentified", 1);
    const { t } = tipear(l, "12345678", 2, 5);
    assert.equal(l.tecla("Enter", t), "12345678");
  });
});
