import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recorteCuadrado } from "./fotos.ts";

describe("recorte cuadrado", () => {
  it("una foto vertical del celu: el cuadrado del centro, achicado a 800", () => {
    assert.deepEqual(recorteCuadrado(3000, 4000), { sx: 0, sy: 500, lado: 3000, salida: 800 });
  });
  it("horizontal: corta los costados", () => {
    assert.deepEqual(recorteCuadrado(1920, 1080), { sx: 420, sy: 0, lado: 1080, salida: 800 });
  });
  it("una foto chica no se agranda", () => {
    assert.deepEqual(recorteCuadrado(500, 600), { sx: 0, sy: 50, lado: 500, salida: 500 });
  });
});
