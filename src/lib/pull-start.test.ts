import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alreadyInCopy, fromCopyStart, pullMode, pullStartAfter, type PullStart } from "./pull-start.ts";

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

describe("arrancar de la fotocopia y arrancar desde ahora conviven", () => {
  const foto = { seq: 340, device: "dev_pc_viejo", at: "2026-09-18T12:00:00.000Z" };

  it("el aparato recuperado toma el cursor de la foto y baja normal desde ahí", () => {
    const r = fromCopyStart(null, foto, HOY);
    assert.deepEqual(r, {
      cursor: 340,
      start: { mode: "live", at: HOY, desde: { device: "dev_pc_viejo", at: foto.at } },
    });
    // Su primera sincronización no saltea nada: ya tiene su marca.
    assert.deepEqual(pullMode(r!.start, 340), { mode: "live", arranca: false });
  });

  it("la PC con datos propios que nunca bajó no pasa por la foto y sigue arrancando desde ahora", () => {
    // Al abrir tenía copia propia: fromCopyStart no se llama y llega sin marca y con cursor 0.
    assert.deepEqual(pullMode(null, 0), { mode: "skip", arranca: true });
  });

  it("un aparato que ya tiene su marca no la cambia por la de una fotocopia", () => {
    const suya: PullStart = { mode: "live", at: AYER };
    assert.equal(fromCopyStart(suya, foto, HOY), null);
  });

  it("una fotocopia sin marca (vieja, o de un aparato que no seguía la cinta) deja el arranque desde ahora", () => {
    assert.equal(fromCopyStart(null, undefined, HOY), null);
    assert.deepEqual(pullMode(null, 0), { mode: "skip", arranca: true });
  });

  it("una foto de un local con la cinta vacía también ancla, en 0", () => {
    assert.equal(fromCopyStart(null, { ...foto, seq: 0 }, HOY)?.cursor, 0);
  });

  it("lo que hizo el aparato de la foto antes de sacarla ya está adentro; lo de después, no", () => {
    const desde = { device: "dev_pc_viejo", at: foto.at };
    assert.equal(alreadyInCopy({ deviceId: "dev_pc_viejo", at: "2026-09-18T11:59:00.000Z" }, desde), true);
    assert.equal(alreadyInCopy({ deviceId: "dev_pc_viejo", at: "2026-09-18T15:00:00.000Z" }, desde), false);
    assert.equal(alreadyInCopy({ deviceId: "dev_celu", at: "2026-09-18T11:00:00.000Z" }, desde), false);
    assert.equal(alreadyInCopy({ deviceId: "dev_pc_viejo", at: "2026-09-18T11:00:00.000Z" }, undefined), false);
  });

  it("la marca del arranque desde la foto sobrevive a las bajadas siguientes", () => {
    const desde = { device: "dev_pc_viejo", at: foto.at };
    const saved: PullStart = { mode: "live", at: AYER, desde };
    assert.deepEqual(pullStartAfter("live", false, saved, HOY), { mode: "live", at: AYER, desde });
  });
});
