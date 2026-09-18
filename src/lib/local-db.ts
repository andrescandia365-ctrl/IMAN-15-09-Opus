import { uid } from "@/lib/utils";
import { keyLockIdle, withKeyLock } from "@/lib/key-lock";
import {
  ackEvents,
  appendEvent,
  mergePulled,
  normalizeQueue,
  pendingOf,
  type Queue,
} from "@/lib/event-queue";
import type { KioskPayload, PayMethod, TicketLine } from "@/lib/types";
import type { ImanEvent } from "@/lib/events";
import type { MyAccess } from "@/lib/license";
import type { StoreMeta } from "@/lib/kiosk";
import type { SyncLogItem, SyncLogStatus } from "./sync-log";
import { pruneSyncLog, trimSyncLog } from "./sync-log";
import type { PullStart } from "./pull-start";

const DB_NAME = "iman-local";
const STORE = "kv";

let currentStoreId = "s1";
const queueListeners = new Set<() => void>();

export function setActiveLocalStore(id: string) {
  currentStoreId = id;
  try {
    window.localStorage.setItem("iman-last-store", id);
  } catch {
    /* ignore */
  }
}

export function activeLocalStore(): string {
  return currentStoreId;
}

export function lastKnownStore(): string {
  try {
    return window.localStorage.getItem("iman-last-store") || "s1";
  } catch {
    return "s1";
  }
}

export function getDeviceId(): string {
  try {
    const cur = window.localStorage.getItem("iman-device");
    if (cur) return cur;
    const id = uid("dev");
    window.localStorage.setItem("iman-device", id);
    return id;
  } catch {
    return "dev_anon";
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbDel(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export async function saveLocalSnapshot(storeId: string, payload: KioskPayload): Promise<void> {
  await idbSet(`snap:${storeId}`, payload);
}

export async function loadLocalSnapshot(storeId: string): Promise<KioskPayload | null> {
  const row = await idbGet<KioskPayload>(`snap:${storeId}`);
  return row ?? null;
}

function qKey(storeId: string): string {
  return `q:${storeId}`;
}

async function readQueue(storeId: string): Promise<Queue> {
  return normalizeQueue(await idbGet<unknown>(qKey(storeId)));
}

async function writeQueue(storeId: string, q: Queue): Promise<void> {
  await idbSet(qKey(storeId), q);
  queueListeners.forEach((fn) => fn());
}

/**
 * Toda modificación de la cola pasa por acá. Leer y escribir sin turno hace que
 * dos movimientos del mismo instante se pisen (devolución a proveedor anota
 * dos: uno se perdía).
 */
function editQueue(storeId: string, edit: (q: Queue) => Queue): Promise<Queue> {
  return withKeyLock(qKey(storeId), async () => {
    const next = edit(await readQueue(storeId));
    await writeQueue(storeId, next);
    return next;
  });
}

/** Espera a que se vacíe la fila de escrituras de un local. */
export function queueIdle(storeId = currentStoreId): Promise<void> {
  return keyLockIdle(qKey(storeId));
}

export function onQueueChange(fn: () => void): () => void {
  queueListeners.add(fn);
  return () => queueListeners.delete(fn);
}

export function recordEvent(type: ImanEvent["type"], body: unknown): ImanEvent {
  const ev: ImanEvent = {
    id: uid("ev"),
    at: new Date().toISOString(),
    deviceId: getDeviceId(),
    storeId: currentStoreId,
    type,
    body: (body && typeof body === "object" ? body : { value: body }) as ImanEvent["body"],
  };
  void editQueue(currentStoreId, (q) => appendEvent(q, ev));
  return ev;
}

export async function pendingEvents(storeId = currentStoreId): Promise<ImanEvent[]> {
  return withKeyLock(qKey(storeId), async () => pendingOf(await readQueue(storeId)));
}

export async function markAcked(storeId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await editQueue(storeId, (q) => ackEvents(q, ids));
}

/**
 * Pone el cursor de la cinta donde llega la fotocopia con la que arrancó el
 * aparato. No cuenta como sincronizar: la hora de la última vez no se toca.
 */
export async function startPullAt(storeId: string, seq: number): Promise<void> {
  await editQueue(storeId, (q) => ({ ...q, lastPullSeq: Math.max(q.lastPullSeq, seq) }));
}

export async function rememberPulled(
  storeId: string,
  events: ImanEvent[],
  cursor: number,
): Promise<void> {
  await editQueue(storeId, (q) => mergePulled(q, events, cursor));
}

export async function syncMeta(storeId = currentStoreId): Promise<{
  pending: number;
  lastSyncAt: string;
  lastPullAt: string;
  lastPullSeq: number;
}> {
  const q = await readQueue(storeId);
  return {
    pending: pendingOf(q).length,
    lastSyncAt: q.lastSyncAt,
    lastPullAt: q.lastPullAt,
    lastPullSeq: q.lastPullSeq,
  };
}

export async function touchSync(storeId: string): Promise<void> {
  await editQueue(storeId, (q) => ({ ...q, lastSyncAt: new Date().toISOString() }));
}

export type { SyncLogItem, SyncLogKind, SyncLogStatus } from "./sync-log";
export { formatSyncLogLine, pruneSyncLog, SYNC_LOG_TTL_MS } from "./sync-log";

function logKey(storeId: string) {
  return `slog:${storeId}`;
}

async function readLog(storeId: string): Promise<SyncLogItem[]> {
  const rows = (await idbGet<SyncLogItem[]>(logKey(storeId))) ?? [];
  return pruneSyncLog(rows);
}

async function writeLog(storeId: string, items: SyncLogItem[]): Promise<void> {
  await idbSet(logKey(storeId), trimSyncLog(items));
  queueListeners.forEach((fn) => fn());
}

export async function appendSyncLog(
  storeId: string,
  row: Omit<SyncLogItem, "id" | "at"> & { id?: string; at?: string },
): Promise<SyncLogItem> {
  const item: SyncLogItem = {
    id: row.id ?? uid("lg"),
    at: row.at ?? new Date().toISOString(),
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    status: row.status,
    hint: row.hint,
    ...(row.keep ? { keep: true } : {}),
  };
  await withKeyLock(logKey(storeId), async () => {
    await writeLog(storeId, [item, ...(await readLog(storeId))]);
  });
  return item;
}

export async function listSyncLog(storeId: string): Promise<SyncLogItem[]> {
  return readLog(storeId);
}

export async function resolvePendingLogs(
  storeId: string,
  opts: { status: SyncLogStatus; detail?: string; hint?: string },
): Promise<void> {
  await withKeyLock(logKey(storeId), async () => {
    const all = await readLog(storeId);
    let changed = false;
    const next = all.map((x) => {
      if (x.status !== "pending") return x;
      changed = true;
      return {
        ...x,
        status: opts.status,
        detail:
          opts.status === "done" && x.kind === "catalog"
            ? "subido"
            : (opts.detail ?? x.detail),
        hint: opts.hint ?? x.hint,
      };
    });
    if (changed) await writeLog(storeId, next);
  });
}

function revKey(storeId: string) {
  return `rev:${storeId}`;
}

/**
 * El rev de la última fotocopia de este local que este aparato conoce del
 * servidor. Se manda al subir: si otro aparato subió en el medio, el servidor
 * no pisa y devuelve la suya para juntar (invariante 5).
 */
export async function readBlobRev(storeId: string): Promise<number | null> {
  const v = await idbGet<number>(revKey(storeId));
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function writeBlobRev(storeId: string, rev: number): Promise<void> {
  await idbSet(revKey(storeId), rev);
}

function startKey(storeId: string) {
  return `pstart:${storeId}`;
}

/** El punto de partida de este aparato en la cinta del local (ver pull-start.ts). */
export async function readPullStart(storeId: string): Promise<PullStart | null> {
  return (await idbGet<PullStart>(startKey(storeId))) ?? null;
}

export async function writePullStart(storeId: string, start: PullStart): Promise<void> {
  await idbSet(startKey(storeId), start);
}

export async function knownEventIds(storeId: string): Promise<Set<string>> {
  const q = await readQueue(storeId);
  return new Set(q.events.map((e) => e.id));
}

export type CachedSession = {
  access: MyAccess;
  stores: StoreMeta[];
  activeStoreId: string;
};

export async function saveSession(row: CachedSession): Promise<void> {
  await idbSet("session", row);
}

export async function loadSession(): Promise<CachedSession | null> {
  return (await idbGet<CachedSession>("session")) ?? null;
}

export async function clearCachedSession(): Promise<void> {
  await idbDel("session");
}

type PendingCopy = { storeId: string; payload: KioskPayload; at: string };

export async function queueCopy(storeId: string, payload: KioskPayload): Promise<void> {
  await idbSet(`copy:${storeId}`, {
    storeId,
    payload,
    at: new Date().toISOString(),
  } satisfies PendingCopy);
}

export async function loadCopy(storeId: string): Promise<KioskPayload | null> {
  const row = await idbGet<PendingCopy>(`copy:${storeId}`);
  return row?.payload ?? null;
}

export async function clearCopy(storeId: string): Promise<void> {
  await idbDel(`copy:${storeId}`);
}

export type DeskEnvelope = {
  id: string;
  storeId: string;
  lines: TicketLine[];
  payMethod?: PayMethod;
  paid?: number | null;
  at: string;
};

const OUTBOX_KEY = "desk-outbox";

export async function queueDeskEnvelope(
  row: Omit<DeskEnvelope, "id" | "at"> & { id?: string; at?: string },
): Promise<DeskEnvelope> {
  const env: DeskEnvelope = {
    id: row.id ?? uid("env"),
    storeId: row.storeId,
    lines: row.lines,
    payMethod: row.payMethod,
    paid: row.paid,
    at: row.at ?? new Date().toISOString(),
  };
  await withKeyLock(OUTBOX_KEY, async () => {
    const all = (await idbGet<DeskEnvelope[]>(OUTBOX_KEY)) ?? [];
    await idbSet(OUTBOX_KEY, [...all, env].slice(-40));
  });
  return env;
}

export async function pendingDeskEnvelopes(): Promise<DeskEnvelope[]> {
  return (await idbGet<DeskEnvelope[]>(OUTBOX_KEY)) ?? [];
}

export async function dropDeskEnvelope(id: string): Promise<void> {
  await withKeyLock(OUTBOX_KEY, async () => {
    const all = (await idbGet<DeskEnvelope[]>(OUTBOX_KEY)) ?? [];
    await idbSet(
      OUTBOX_KEY,
      all.filter((e) => e.id !== id),
    );
  });
}
