import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { errorText, isCloudWaking } from "./errors.ts";

describe("errores de la nube en lenguaje de piso", () => {
  it("el primer request del día no dice timeout", () => {
    const wake = errorText(new Error("the database system is starting up"), "No se pudo");
    assert.equal(wake, "La nube está despertando. Tocá de nuevo en un toque.");
    assert.doesNotMatch(wake, /timeout/i);
    const tardó = errorText(new Error("timeout"), "No se pudo");
    assert.equal(tardó, "La nube tardó. Probá de nuevo.");
    assert.doesNotMatch(tardó, /timeout/i);
    assert.equal(isCloudWaking(new Error("Connection terminated unexpectedly")), true);
    assert.equal(isCloudWaking(new Error("timeout")), true);
  });

  it("sin red sigue siendo sin red", () => {
    assert.equal(errorText(new Error("Failed to fetch"), "x"), "Sin red. Quedó en este aparato.");
    assert.equal(isCloudWaking(new Error("Failed to fetch")), false);
  });
});
