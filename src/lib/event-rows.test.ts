import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { eventRows } from "./event-rows.ts";
import type { ImanEvent } from "./events.ts";

function ev(partial: Partial<ImanEvent> = {}): ImanEvent {
  return {
    id: "ev_1",
    at: "2026-09-18T12:00:00.000Z",
    deviceId: "dev_pc",
    storeId: "s1",
    type: "sale",
    body: { id: "v1", total: 1200 },
    ...partial,
  };
}

/** Los valores que quedaron en la tupla n, en el orden de las columnas. */
function fila(text: string, params: unknown[], n: number): unknown[] {
  const tupla = text.slice(text.indexOf("values ")).split("), (")[n]!;
  return [...tupla.matchAll(/\$(\d+)/g)].map((m) => params[Number(m[1]) - 1]);
}

describe("la tanda de eventos sube en un solo INSERT", () => {
  it("una tanda vacía no arma consulta y no confirma nada", () => {
    const r = eventRows("u1", "s1", []);
    assert.equal(r.text, "");
    assert.deepEqual(r.params, []);
    assert.deepEqual(r.accepted, []);
  });

  it("cada evento queda en su tupla, con las columnas en orden", () => {
    const eventos = [ev({ id: "ev_a" }), ev({ id: "ev_b", type: "drop", deviceId: "dev_celu" })];
    const { text, params, accepted } = eventRows("u1", "s1", eventos);
    assert.deepEqual(accepted, ["ev_a", "ev_b"]);
    assert.equal(text.split("), (").length, 2);
    assert.deepEqual(fila(text, params, 0), [
      "u1",
      "s1",
      "ev_a",
      "2026-09-18T12:00:00.000Z",
      "dev_pc",
      "sale",
      JSON.stringify({ id: "v1", total: 1200 }),
    ]);
    assert.deepEqual(fila(text, params, 1), [
      "u1",
      "s1",
      "ev_b",
      "2026-09-18T12:00:00.000Z",
      "dev_celu",
      "drop",
      JSON.stringify({ id: "v1", total: 1200 }),
    ]);
  });

  it("200 eventos son una sola consulta y ningún dato se cruza de fila", () => {
    const eventos = Array.from({ length: 200 }, (_, i) =>
      ev({ id: `ev_${i}`, deviceId: `dev_${i}`, body: { n: i } }),
    );
    const { text, params, accepted } = eventRows("u1", "s1", eventos);
    assert.equal(accepted.length, 200);
    assert.equal(text.split("), (").length, 200);
    assert.equal(params.length, 2 + 200 * 5);
    for (const i of [0, 1, 99, 198, 199]) {
      const f = fila(text, params, i);
      assert.equal(f[2], `ev_${i}`);
      assert.equal(f[4], `dev_${i}`);
      assert.equal(f[6], JSON.stringify({ n: i }));
    }
  });

  it("un evento sin id o sin tipo no entra ni se marca como subido", () => {
    const { text, accepted } = eventRows("u1", "s1", [
      ev({ id: "ev_ok" }),
      ev({ id: "" }),
      ev({ id: "ev_sin_tipo", type: undefined as unknown as ImanEvent["type"] }),
    ]);
    assert.deepEqual(accepted, ["ev_ok"]);
    assert.equal(text.split("), (").length, 1);
  });

  it("el mismo id dos veces entra una vez, pero se confirma igual", () => {
    // Si no se confirmara, el aparato lo dejaría pendiente y lo subiría para siempre.
    const { text, accepted } = eventRows("u1", "s1", [ev({ id: "ev_a" }), ev({ id: "ev_a" })]);
    assert.deepEqual(accepted, ["ev_a", "ev_a"]);
    assert.equal(text.split("), (").length, 1);
  });

  it("un aparato sin id de aparato queda como 'dev', no como vacío", () => {
    const { text, params } = eventRows("u1", "s1", [ev({ deviceId: "" })]);
    assert.equal(fila(text, params, 0)[4], "dev");
  });

  it("un body vacío viaja como objeto vacío, no como null", () => {
    const { text, params } = eventRows("u1", "s1", [
      ev({ body: undefined as unknown as ImanEvent["body"] }),
    ]);
    assert.equal(fila(text, params, 0)[6], "{}");
  });

  it("choca contra lo que ya está en la cinta sin romper la tanda", () => {
    const { text } = eventRows("u1", "s1", [ev()]);
    assert.match(text, /on conflict \(user_id, store_id, event_id\) do nothing/);
  });
});
