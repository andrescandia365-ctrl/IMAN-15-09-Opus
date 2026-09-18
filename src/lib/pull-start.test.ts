import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pullMode, pullStartAfter, type PullStart } from "./pull-start.ts";

const AYER = "2026-09-17T12:00:00.000Z";
const HOY = "2026-09-18T12:00:00.000Z";

describe("punto de partida de un aparato en la cinta", () => {
  it("la PC que nunca bajó arranca desde su estado actual, una vez", () => {
    assert.deepEqual(pullMode(null, 0), { mode: "skip", arranca: true });
  });

  it("el aparato que Chrome dejó en blanco también arranca de cero: la marca se fue con los datos", () => {
    // Borrado de datos: no hay marca ni cursor, igual que la primera vez.
    assert.deepEqual(pullMode(null, 0), { mode: "skip", arranca: true });
  });

  it("un celu que ya venía bajando antes de este cambio sigue normal, sin saltear nada", () => {
    assert.deepEqual(pullMode(null, 348), { mode: "live", arranca: false });
  });

  it("una sincronización normal nunca vuelve a arrancar, aunque la cinta siga vacía", () => {
    const live: PullStart = { mode: "live", at: AYER };
    // Local nuevo sin eventos: el cursor sigue en 0, pero ya tiene marca.
    assert.deepEqual(pullMode(live, 0), { mode: "live", arranca: false });
    assert.deepEqual(pullMode(live, 900), { mode: "live", arranca: false });
  });

  it("si la historia no entra en un toque, el siguiente sigue salteando sin volver a arrancar", () => {
    const salteando = pullStartAfter("skip", true, null, HOY);
    assert.deepEqual(salteando, { mode: "skip", at: HOY });
    assert.deepEqual(pullMode(salteando, 10_000), { mode: "skip", arranca: false });
  });

  it("al llegar al final de la cinta queda normal, con la fecha del arranque", () => {
    const salteando: PullStart = { mode: "skip", at: AYER };
    assert.deepEqual(pullStartAfter("skip", false, salteando, HOY), { mode: "live", at: AYER });
    assert.deepEqual(pullStartAfter("skip", false, null, HOY), { mode: "live", at: HOY });
  });

  it("bajando normal, quedar con páginas pendientes no la vuelve a poner a saltear", () => {
    const live: PullStart = { mode: "live", at: AYER };
    assert.deepEqual(pullStartAfter("live", true, live, HOY), { mode: "live", at: AYER });
  });
});
