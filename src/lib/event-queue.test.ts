import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ACKED_KEEP,
  appendEvent,
  ackEvents,
  chunk,
  emptyQueue,
  mergePulled,
  normalizeQueue,
  pendingOf,
  trimQueue,
  type Queue,
} from "./event-queue.ts";
import { withKeyLock } from "./key-lock.ts";
import type { ImanEvent } from "./events.ts";

function ev(id: string, over: Partial<ImanEvent> = {}): ImanEvent {
  return {
    id,
    at: "2026-09-15T12:00:00.000Z",
    deviceId: "dev_pc",
    storeId: "s1",
    type: "sale",
    body: {},
    ...over,
  };
}

test("dos movimientos del mismo instante no se pisan", () => {
  const q = appendEvent(appendEvent(emptyQueue(), ev("ev_refund")), ev("ev_ledger"));
  assert.deepEqual(
    pendingOf(q).map((e) => e.id),
    ["ev_refund", "ev_ledger"],
  );
});

test("el mismo movimiento no entra dos veces", () => {
  const q = appendEvent(appendEvent(emptyQueue(), ev("ev_1")), ev("ev_1"));
  assert.equal(q.events.length, 1);
});

test("solo se marca como subido lo confirmado", () => {
  let q = appendEvent(appendEvent(emptyQueue(), ev("ev_1")), ev("ev_2"));
  q = ackEvents(q, ["ev_1"]);
  assert.deepEqual(
    pendingOf(q).map((e) => e.id),
    ["ev_2"],
  );
});

test("el recorte nunca tira lo que falta subir", () => {
  let q: Queue = emptyQueue();
  for (let i = 0; i < ACKED_KEEP + 500; i += 1) q = appendEvent(q, ev(`ack_${i}`));
  q = ackEvents(
    q,
    q.events.map((e) => e.id),
  );
  q = appendEvent(q, ev("venta_sin_red"));
  q = trimQueue(q);
  assert.equal(q.events.filter((e) => e.acked).length, ACKED_KEEP);
  assert.deepEqual(
    pendingOf(q).map((e) => e.id),
    ["venta_sin_red"],
  );
});

test("un día entero sin red no pierde tickets", () => {
  let q: Queue = emptyQueue();
  for (let i = 0; i < 3000; i += 1) q = appendEvent(q, ev(`venta_${i}`));
  assert.equal(pendingOf(q).length, 3000);
});

test("el cursor del servidor solo avanza", () => {
  const q = mergePulled(emptyQueue(), [ev("ev_a")], 12);
  assert.equal(q.lastPullSeq, 12);
  assert.equal(mergePulled(q, [], 5).lastPullSeq, 12);
});

test("lo que baja queda marcado para no aplicarlo dos veces", () => {
  const q = mergePulled(emptyQueue(), [ev("ev_celu")], 3);
  assert.equal(pendingOf(q).length, 0);
  assert.equal(q.events[0]?.acked, true);
});

test("la cola vieja del aparato se lee sin cursor", () => {
  const q = normalizeQueue({
    events: [{ ...ev("ev_1"), acked: true }],
    lastPullAt: "2026-09-14T10:00:00.000Z",
    lastSyncAt: "2026-09-14T10:00:01.000Z",
  });
  assert.equal(q.lastPullSeq, 0);
  assert.equal(q.lastPullAt, "2026-09-14T10:00:00.000Z");
  assert.equal(q.events.length, 1);
});

test("se sube en tandas", () => {
  const rows = Array.from({ length: 450 }, (_, i) => i);
  assert.deepEqual(
    chunk(rows, 200).map((c) => c.length),
    [200, 200, 50],
  );
  assert.deepEqual(chunk([], 200), []);
});

test("el candado ordena lecturas y escrituras sobre la misma clave", async () => {
  let stored = 0;
  const bump = () =>
    withKeyLock("q:s1", async () => {
      const read = stored;
      await new Promise((r) => setTimeout(r, 5));
      stored = read + 1;
    });
  await Promise.all([bump(), bump(), bump()]);
  assert.equal(stored, 3);
});

test("sin candado se pisan (por qué existe el candado)", async () => {
  let stored = 0;
  const bump = async () => {
    const read = stored;
    await new Promise((r) => setTimeout(r, 5));
    stored = read + 1;
  };
  await Promise.all([bump(), bump(), bump()]);
  assert.equal(stored, 1);
});
