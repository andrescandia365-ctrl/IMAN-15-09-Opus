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
  rememberPulled,
  resolvePendingLogs,
  saveLocalSnapshot,
  syncMeta,
  touchSync,
} from "@/lib/local-db";
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

export async function syncNow(
  storeId: string,
  rev?: number,
): Promise<{ ok: boolean; pushed: number; pulled: number; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, pushed: 0, pulled: 0, error: "Sin red. Los tickets siguen en este aparato." };
  }
  try {
    const pushed = await pushPending(storeId);
    const meta = await syncMeta(storeId);
    const mine = getDeviceId();
    const known = await knownEventIds(storeId);
    const pulled: ImanEvent[] = [];
    let cursor = meta.lastPullSeq;
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const remote = await pullEvents({
        data: { storeId, after: meta.lastPullAt, afterSeq: cursor || undefined },
      });
      pulled.push(...remote.events);
      cursor = remote.cursor;
      if (!remote.hasMore) break;
    }
    const fresh = pulled.filter((e) => e.deviceId !== mine && !known.has(e.id));
    if (fresh.length) {
      const snap = prunePayload(snapshotKiosk(useImanStore.getState()));
      const next = applyEvents(snap, fresh);
      useImanStore.setState(pulledPatch(next));
      await saveLocalSnapshot(storeId, next);
    }
    await rememberPulled(storeId, pulled, cursor);
    const payload = prunePayload(snapshotKiosk(useImanStore.getState()));
    await saveLocalSnapshot(storeId, payload);
    await saveBlob(storeId, payload, rev);
    return { ok: true, pushed, pulled: fresh.length };
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

/** Celu: mira Neon. PC: sube lo pendiente. */
export async function reviewCloud(
  storeId: string,
  opts: { phone: boolean; rev?: number },
): Promise<CloudReview> {
  if (opts.phone) {
    const pulled = await pullCopy(storeId);
    try {
      await syncNow(storeId, opts.rev);
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
    return pulled;
  }

  const pushed = await pushCopy(storeId, undefined, opts.rev);
  try {
    await pushQuiet(storeId);
  } catch {
    /* la fotocopia es lo que viaja el pedido */
  }
  if (pushed.ok) {
    await resolvePendingLogs(storeId, {
      status: "done",
      hint: "El celu ya lo puede tener",
    });
    await touchSync(storeId);
    return {
      ok: true,
      newOrders: 0,
      emptyRemote: false,
      message: "Subido. El celu ya lo puede tener.",
    };
  }
  return {
    ok: false,
    newOrders: 0,
    emptyRemote: false,
    error: pushed.error,
    message: pushed.error || "No pude subir",
  };
}
