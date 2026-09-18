import { applyEvents, pulledPatch } from "@/lib/events";
import {
  appendSyncLog,
  clearCopy,
  getDeviceId,
  knownEventIds,
  loadCopy,
  loadLocalSnapshot,
  markAcked,
  pendingEvents,
  queueCopy,
  readPullStart,
  rememberPulled,
  resolvePendingLogs,
  saveLocalSnapshot,
  syncMeta,
  touchSync,
  writePullStart,
} from "@/lib/local-db";
import { pullMode, pullStartAfter } from "@/lib/pull-start";
import { pullEvents, pushEvents, saveKiosk, selectStore } from "@/lib/kiosk";
import { snapshotKiosk, useImanStore } from "@/lib/store";
import { incomingCopy, mergePayload, prunePayload } from "@/lib/cap";
import { chunk } from "@/lib/event-queue";
import type { ImanEvent } from "@/lib/events";
import type { KioskPayload } from "@/lib/types";
import { errorText } from "@/lib/errors";

/** Cuántas páginas de la cinta se bajan de una. 20 × 500 = un mes parado. */
const MAX_PULL_PAGES = 20;

/**
 * Sube en tandas y marca como subido solo lo que el servidor confirmó. Antes se
 * daba todo por subido aunque el servidor cortara la lista: lo que sobraba
 * quedaba marcado y no viajaba nunca.
 */
async function pushPending(storeId: string): Promise<number> {
  const pending = await pendingEvents(storeId);
  if (!pending.length) return 0;
  let sent = 0;
  for (const batch of chunk(pending)) {
    const res = await pushEvents({ data: { storeId, events: batch } });
    const accepted = res.accepted?.length ? res.accepted : batch.map((e) => e.id);
    await markAcked(storeId, accepted);
    sent += accepted.length;
  }
  return sent;
}

/**
 * Guarda la fotocopia del local. Si otro aparato subió algo en el medio, junta
 * las dos y reintenta una vez en lugar de pisarlo.
 */
async function saveBlob(storeId: string, payload: KioskPayload, rev?: number): Promise<void> {
  const res = await saveKiosk({ data: { storeId, payload, rev } });
  if (res.ok) return;
  const merged = prunePayload(mergePayload(res.payload, payload));
  useImanStore.getState().hydrateKiosk(merged, { keepUi: true });
  await saveLocalSnapshot(storeId, merged);
  await saveKiosk({ data: { storeId, payload: merged, rev: res.rev } });
}

export type SyncResult = {
  ok: boolean;
  pushed: number;
  pulled: number;
  error?: string;
  /** Quedó cinta sin bajar por el tope de páginas: el próximo toque sigue desde ahí. */
  more?: boolean;
  /** Esta vez el aparato tomó su estado como punto de partida (ver pull-start.ts). */
  started?: boolean;
};

export async function syncNow(storeId: string, rev?: number): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, pushed: 0, pulled: 0, error: "Sin red. Los tickets siguen en este aparato." };
  }
  try {
    const pushed = await pushPending(storeId);
    const meta = await syncMeta(storeId);
    const saved = await readPullStart(storeId);
    const { mode, arranca } = pullMode(saved, meta.lastPullSeq);
    const now = new Date().toISOString();
    if (arranca) {
      // Antes de bajar: si se corta a mitad de camino, la próxima vez sigue salteando.
      await writePullStart(storeId, { mode: "skip", at: now });
      await appendSyncLog(storeId, {
        kind: "pull",
        title: "Primera sincronización",
        detail: "se toma el estado actual como punto de partida",
        status: "done",
        keep: true,
      });
    }
    const mine = getDeviceId();
    const known = await knownEventIds(storeId);
    const pulled: ImanEvent[] = [];
    let cursor = meta.lastPullSeq;
    let more = false;
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const remote = await pullEvents({
        data: { storeId, after: meta.lastPullAt, afterSeq: cursor || undefined },
      });
      pulled.push(...remote.events);
      cursor = remote.cursor;
      more = remote.hasMore;
      if (!more) break;
    }
    // Salteando, la historia se da por vista sin aplicarla.
    const fresh = mode === "skip" ? [] : pulled.filter((e) => e.deviceId !== mine && !known.has(e.id));
    if (fresh.length) {
      const snap = prunePayload(snapshotKiosk(useImanStore.getState()));
      const next = applyEvents(snap, fresh);
      useImanStore.setState(pulledPatch(next));
      await saveLocalSnapshot(storeId, next);
    }
    await rememberPulled(storeId, pulled, cursor);
    await writePullStart(storeId, pullStartAfter(mode, more, saved, now));
    const payload = prunePayload(snapshotKiosk(useImanStore.getState()));
    await saveLocalSnapshot(storeId, payload);
    await saveBlob(storeId, payload, rev);
    return { ok: true, pushed, pulled: fresh.length, more, started: mode === "skip" };
  } catch (err) {
    return {
      ok: false,
      pushed: 0,
      pulled: 0,
      error: errorText(err, "No se pudo sincronizar"),
    };
  }
}

export async function pushQuiet(storeId: string): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  return pushPending(storeId);
}

export async function pushCopy(
  storeId: string,
  payload?: KioskPayload,
  rev?: number,
): Promise<{ ok: boolean; error?: string }> {
  const snap = payload ?? (await loadCopy(storeId)) ?? (await loadLocalSnapshot(storeId));
  if (!snap) return { ok: true };
  const body = prunePayload(snap);
  await queueCopy(storeId, body);
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "Sin red. La fotocopia queda pendiente." };
  }
  try {
    await saveBlob(storeId, body, rev);
    await clearCopy(storeId);
    await touchSync(storeId);
    await resolvePendingLogs(storeId, {
      status: "done",
      hint: "El celu ya lo puede tener",
    });
    return { ok: true };
  } catch (err) {
    const error = errorText(err, "No pude subir el local");
    await resolvePendingLogs(storeId, { status: "fail", detail: error });
    return { ok: false, error };
  }
}

export async function flushCopy(storeId: string): Promise<{ ok: boolean; error?: string }> {
  return pushCopy(storeId);
}

export type CloudReview = {
  ok: boolean;
  newOrders: number;
  emptyRemote: boolean;
  error?: string;
  message: string;
};

export async function pullCopy(storeId: string): Promise<CloudReview> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      ok: false,
      newOrders: 0,
      emptyRemote: false,
      error: "Sin red.",
      message: "Sin red. El pedido queda en este aparato hasta que vuelva.",
    };
  }
  try {
    const remote = await selectStore({ data: { storeId } });
    const local = (await loadLocalSnapshot(storeId)) ?? prunePayload(snapshotKiosk(useImanStore.getState()));
    const { payload, newOrders, emptyRemote } = incomingCopy(remote.payload, local);
    if (emptyRemote) {
      return {
        ok: true,
        newOrders: 0,
        emptyRemote: true,
        message: "Nada nuevo en la nube",
      };
    }
    if (newOrders > 0) {
      useImanStore.getState().hydrateKiosk(payload, { keepUi: true });
      await saveLocalSnapshot(storeId, payload);
    }
    await touchSync(storeId);
    return {
      ok: true,
      newOrders,
      emptyRemote: false,
      message:
        newOrders > 0
          ? `Bajando trabajo de la nube — ${newOrders} ${newOrders === 1 ? "pedido" : "pedidos"}`
          : "Nada nuevo en la nube",
    };
  } catch (err) {
    const error = errorText(err, "No pude hablar con la nube");
    return {
      ok: false,
      newOrders: 0,
      emptyRemote: false,
      error,
      message: error,
    };
  }
}

const QUEDAN_MAS = "Quedan más, tocá de nuevo.";

function cambios(n: number): string {
  return `${n} ${n === 1 ? "cambio" : "cambios"}`;
}

/** Celu: mira Neon y baja. PC: sube la fotocopia, después baja, aplica y vuelve a subir. */
export async function reviewCloud(
  storeId: string,
  opts: { phone: boolean; rev?: number },
): Promise<CloudReview> {
  if (opts.phone) {
    const pulled = await pullCopy(storeId);
    let sync: SyncResult | null = null;
    try {
      sync = await syncNow(storeId, opts.rev);
    } catch {
      /* el pull ya habló con Neon */
    }
    await appendSyncLog(storeId, {
      kind: pulled.newOrders > 0 ? "pull" : "empty",
      title: pulled.newOrders > 0 ? "Bajando trabajo de la nube" : "Nada nuevo en la nube",
      detail:
        pulled.newOrders > 0
          ? `${pulled.newOrders} ${pulled.newOrders === 1 ? "pedido" : "pedidos"}`
          : pulled.ok
            ? "listo"
            : pulled.message,
      status: pulled.ok ? "done" : "fail",
    });
    return sync?.more ? { ...pulled, message: `${pulled.message}. ${QUEDAN_MAS}` } : pulled;
  }

  // PC. Primero la fotocopia: si la bajada se corta, el respaldo y los pedidos
  // ya subieron, y una fotocopia vieja que quedó en cola no puede pisar lo que
  // sube syncNow al final, que es lo más completo (lo de la caja más lo que bajó).
  const copia = await pushCopy(storeId, undefined, opts.rev);
  const sync = await syncNow(storeId, opts.rev);

  if (!sync.ok) {
    const error = sync.error || copia.error || "No pude sincronizar";
    await appendSyncLog(storeId, {
      kind: "empty",
      title: "No pude bajar de la nube",
      detail: error,
      status: "fail",
    });
    return {
      ok: false,
      newOrders: 0,
      emptyRemote: false,
      error,
      message: copia.ok ? `Subió el respaldo, pero no pude bajar: ${error}` : error,
    };
  }

  const sube =
    sync.pushed === 1 ? "Subió 1 cambio" : sync.pushed > 1 ? `Subieron ${cambios(sync.pushed)}` : "Subió todo";
  const baja = sync.started
    ? "Primera sincronización: se toma el estado actual como punto de partida"
    : sync.pulled === 1
      ? "Bajó 1 cambio de otro aparato"
      : sync.pulled > 1
        ? `Bajaron ${cambios(sync.pulled)} de otros aparatos`
        : "No había nada nuevo para bajar";
  await appendSyncLog(storeId, {
    kind: "catalog",
    title: "Subido a la nube",
    detail: sync.pushed > 0 ? cambios(sync.pushed) : "listo",
    status: "done",
    hint: "El celu ya lo puede tener",
  });
  if (!sync.started) {
    await appendSyncLog(storeId, {
      kind: sync.pulled > 0 ? "pull" : "empty",
      title: sync.pulled > 0 ? "Bajado de otros aparatos" : "Nada nuevo en la nube",
      detail: sync.pulled > 0 ? cambios(sync.pulled) : "listo",
      status: "done",
    });
  }
  return {
    ok: true,
    newOrders: 0,
    emptyRemote: false,
    message: `${sube}. ${baja}.${sync.more ? ` ${QUEDAN_MAS}` : ""}`,
  };
}
