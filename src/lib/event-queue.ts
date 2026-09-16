import type { ImanEvent } from "@/lib/events";

export type Queue = {
  events: ImanEvent[];
  lastPullAt: string;
  lastPullSeq: number;
  lastSyncAt: string;
};

export const EPOCH = "1970-01-01T00:00:00.000Z";
/** Movimientos ya subidos que guardamos para no aplicarlos dos veces. */
export const ACKED_KEEP = 2000;
/** Cuántos movimientos viajan por llamada. El servidor corta en 400. */
export const PUSH_BATCH = 200;

export function emptyQueue(): Queue {
  return { events: [], lastPullAt: EPOCH, lastPullSeq: 0, lastSyncAt: "" };
}

/** Lee la cola guardada en el aparato, incluida la forma vieja sin `lastPullSeq`. */
export function normalizeQueue(raw: unknown): Queue {
  if (!raw || typeof raw !== "object") return emptyQueue();
  const q = raw as Partial<Queue>;
  return {
    events: Array.isArray(q.events) ? q.events.filter((e) => Boolean(e?.id)) : [],
    lastPullAt: typeof q.lastPullAt === "string" && q.lastPullAt ? q.lastPullAt : EPOCH,
    lastPullSeq: Number.isFinite(q.lastPullSeq) ? Number(q.lastPullSeq) : 0,
    lastSyncAt: typeof q.lastSyncAt === "string" ? q.lastSyncAt : "",
  };
}

/**
 * Recorta la cola sin tocar lo que todavía no se subió: un local que vendió
 * todo el día sin internet no puede perder tickets por un tope.
 */
export function trimQueue(q: Queue): Queue {
  const acked = q.events.filter((e) => e.acked);
  if (acked.length <= ACKED_KEEP) return q;
  const keep = new Set(acked.slice(-ACKED_KEEP).map((e) => e.id));
  return { ...q, events: q.events.filter((e) => !e.acked || keep.has(e.id)) };
}

export function appendEvent(q: Queue, ev: ImanEvent): Queue {
  if (q.events.some((e) => e.id === ev.id)) return q;
  return trimQueue({ ...q, events: [...q.events, { ...ev, acked: false }] });
}

export function ackEvents(q: Queue, ids: string[]): Queue {
  if (!ids.length) return q;
  const set = new Set(ids);
  return trimQueue({
    ...q,
    events: q.events.map((e) => (set.has(e.id) ? { ...e, acked: true } : e)),
  });
}

export function pendingOf(q: Queue): ImanEvent[] {
  return q.events.filter((e) => !e.acked);
}

/** Guarda lo que bajó (ya aplicado) y adelanta el cursor del servidor. */
export function mergePulled(
  q: Queue,
  events: ImanEvent[],
  cursor: number,
  at = new Date().toISOString(),
): Queue {
  const have = new Set(q.events.map((e) => e.id));
  const extra = events.filter((e) => !have.has(e.id)).map((e) => ({ ...e, acked: true }));
  const lastPullAt = events.reduce((m, e) => (e.at > m ? e.at : m), q.lastPullAt);
  return trimQueue({
    events: [...q.events, ...extra],
    lastPullAt,
    lastPullSeq: Math.max(q.lastPullSeq, cursor),
    lastSyncAt: at,
  });
}

export function chunk<T>(rows: T[], size = PUSH_BATCH): T[][] {
  if (size <= 0) return [rows];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
