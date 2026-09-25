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
  readBlobRev,
  readPullStart,
  rememberPulled,
  resolvePendingLogs,
  saveLocalSnapshot,
  startPullAt,
  syncMeta,
  touchSync,
  writeBlobRev,
  writePullStart,
} from "@/lib/local-db";
import { anotarCaja } from "@/lib/caja-local";
import { withKeyLock } from "@/lib/key-lock";
import { alreadyInCopy, fromCopyStart, pullMode, pullStartAfter } from "@/lib/pull-start";
import { pullEvents, pushEvents, saveKiosk, selectStore } from "@/lib/kiosk";
import { encodeCopyPayload } from "@/lib/copy-gzip";
import { snapshotKiosk, useImanStore } from "@/lib/store";
import {
  backupRecords,
  incomingCopy,
  mergeBackup,
  preferLiveCopy,
  prunePayload,
  puedeRespaldar,
  registrosNuevos,
} from "@/lib/cap";
import { chunk } from "@/lib/event-queue";
import { nombresBorrados, quitadosPor } from "@/lib/deleted";
import type { ImanEvent } from "@/lib/events";
import type { KioskPayload } from "@/lib/types";
import { errorText, isCloudWaking } from "@/lib/errors";

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
    anotarCaja(storeId, res.caja);
    const accepted = res.accepted?.length ? res.accepted : batch.map((e) => e.id);
    await markAcked(storeId, accepted);
    sent += accepted.length;
  }
  return sent;
}

/**
 * Hasta qué seq de la cinta refleja el estado de ahora. Se actualiza en el
 * mismo paso en que se aplica lo que bajó, así la marca de la fotocopia dice
 * exactamente hasta dónde llega la foto.
 */
const aplicado = new Map<string, number>();

/** Lo que este aparato tiene ahora mismo, listo para subir. */
function liveCopy(): KioskPayload {
  return prunePayload(snapshotKiosk(useImanStore.getState()));
}

/**
 * Baja la cinta por seq y aplica lo de otros aparatos sobre el estado de ahora.
 * La primera vez que el aparato baja, en cambio, da por vista la historia (ver
 * pull-start.ts).
 */
async function pullApply(storeId: string): Promise<{ pulled: number; more: boolean; started: boolean }> {
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
    anotarCaja(storeId, remote.caja);
    cursor = remote.cursor;
    more = remote.hasMore;
    if (!more) break;
  }
  // Salteando, la historia se da por vista sin aplicarla. Arrancando de una
  // fotocopia, lo que su aparato hizo antes de la foto ya está adentro.
  const fresh =
    mode === "skip"
      ? []
      : pulled.filter((e) => e.deviceId !== mine && !known.has(e.id) && !alreadyInCopy(e, saved?.desde));
  let next: KioskPayload | null = null;
  let quitados: string[] = [];
  if (fresh.length) {
    const antes = liveCopy();
    next = applyEvents(antes, fresh);
    quitados = quitadosPor(antes.products, fresh);
    useImanStore.setState(pulledPatch(next));
  }
  aplicado.set(storeId, cursor);
  if (next) await saveLocalSnapshot(storeId, next);
  if (quitados.length) {
    // Si un día "desaparecen productos", queda el rastro de que fue un borrado.
    await appendSyncLog(storeId, {
      kind: "catalog",
      title: "Borrado desde otro aparato",
      detail: nombresBorrados(quitados),
      status: "done",
    });
  }
  await rememberPulled(storeId, pulled, cursor);
  await writePullStart(storeId, pullStartAfter(mode, more, saved, now));
  return { pulled: fresh.length, more, started: mode === "skip" };
}

/**
 * Turnos, retiros e historial que trajo la fotocopia de otro aparato quedan
 * también acá, sumados sobre el estado de ahora. Se lee y se escribe en el
 * mismo paso: lo que se cobre mientras tanto no se pierde. Devuelve cuántos
 * registros trajo, para que "Bajaron N cambios" los cuente.
 */
function adoptRecords(server: KioskPayload): number {
  const st = useImanStore.getState();
  const antes = { shifts: st.shifts, drops: st.drops, movements: st.movements };
  const next = backupRecords(server, antes);
  useImanStore.setState(next);
  return registrosNuevos(antes, next);
}

/**
 * Sube la fotocopia con el rev que este aparato conoce (invariante 5). Si otro
 * aparato subió en el medio, el servidor no pisa y devuelve la suya: acá se
 * baja y aplica la cinta, se suman turnos, retiros e historial de los dos lados
 * (y quedan también en este aparato) y se reintenta una vez. Si vuelve a
 * chocar, no pisa: avisa.
 *
 * Antes, al chocar, reemplazaba el estado vivo con una foto tomada antes de ir
 * al servidor: una venta cobrada en el medio desaparecía de la pantalla. Ahora
 * el estado vivo solo se toca con lo que llega (la cinta y esos registros).
 */
/**
 * Qué pasó con la fotocopia. `sin-bajar` no es un éxito: no se subió nada
 * porque este aparato todavía no bajó el local. Antes esto devolvía 0 y viajaba
 * como "listo": el kiosquero veía verde y el respaldo no existía.
 */
export type CopyEstado = "subida" | "sin-bajar";

async function saveBlob(
  storeId: string,
  opts: { juntar?: boolean } = {},
): Promise<{ estado: CopyEstado; pulled: number }> {
  // `pulled`: cuántos cambios de otros aparatos bajó al juntar (0 si no chocó).
  return withKeyLock(`blob:${storeId}`, async () => {
    // La foto dice hasta dónde de la cinta llega, si este aparato ya la sigue.
    const sigue = (await readPullStart(storeId))?.mode === "live";
    const inicial = aplicado.has(storeId) ? 0 : (await syncMeta(storeId)).lastPullSeq;
    const foto = (): KioskPayload => {
      const body = liveCopy();
      if (!sigue) return body;
      const mark = { seq: aplicado.get(storeId) ?? inicial, device: getDeviceId(), at: new Date().toISOString() };
      return { ...body, mark };
    };
    const body = foto();
    // Un aparato que todavía no bajó este local no pisa la fotocopia: no tiene
    // con qué compararse. Tener poco sí se respalda (ver `puedeRespaldar`).
    const conocido = await readBlobRev(storeId);
    if (!puedeRespaldar(conocido)) return { estado: "sin-bajar" as const, pulled: 0 };
    const rev = conocido ?? 0;
    const packed = await encodeCopyPayload(body);
    const res = await saveKiosk({ data: { storeId, rev, ...packed } });
    if (res.ok) {
      await writeBlobRev(storeId, res.rev);
      return { estado: "subida" as const, pulled: 0 };
    }
    if (opts.juntar === false) throw new Error("Otro aparato subió en el medio. Queda para el próximo Sincronizar.");
    const { pulled: deLaCinta } = await pullApply(storeId);
    // Lo que trajo la fotocopia del otro aparato también bajó: sin esto,
    // "Bajaron N cambios" decía cero aunque llegaran turnos o retiros.
    const pulled = deLaCinta + adoptRecords(res.payload);
    const local = foto();
    await saveLocalSnapshot(storeId, liveCopy());
    // La marca es la de esta foto, no la que traía la fotocopia del otro aparato.
    const merged = { ...mergeBackup(res.payload, local), mark: local.mark };
    if (!merged.mark) delete merged.mark;
    const packedAgain = await encodeCopyPayload(merged);
    const again = await saveKiosk({ data: { storeId, rev: res.rev, ...packedAgain } });
    if (!again.ok) throw new Error("Otro aparato estaba subiendo al mismo tiempo. Tocá Sincronizar de nuevo.");
    await writeBlobRev(storeId, again.rev);
    return { estado: "subida" as const, pulled };
  });
}

/** Lo que se le dice al kiosquero cuando el respaldo no subió por no haber bajado. */
const SIN_BAJAR = "No se respaldó: este aparato todavía no bajó el local.";
const SIN_BAJAR_HINT = "Abrí la app con internet y tocá Sincronizar.";

/**
 * Un aparato que arranca de la fotocopia (no tenía copia propia) sigue la
 * cinta desde donde llega la foto, en lugar de dar por vista la historia: así
 * un aparato recuperado después de que Chrome le borró los datos recupera
 * también lo que se hizo después del último Sincronizar. Ver pull-start.ts.
 */
export async function startFromCopy(storeId: string, payload: KioskPayload): Promise<void> {
  const r = fromCopyStart(await readPullStart(storeId), payload.mark, new Date().toISOString());
  if (!r || !payload.mark) return;
  await startPullAt(storeId, r.cursor);
  await writePullStart(storeId, r.start);
  aplicado.set(storeId, r.cursor);
  const cuando = new Date(payload.mark.at).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  await appendSyncLog(storeId, {
    kind: "pull",
    title: "Arranque desde la fotocopia",
    detail: `del ${cuando}; se aplica lo que vino después`,
    status: "done",
    keep: true,
  });
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
  /** Qué pasó con la fotocopia: `sin-bajar` es que no se respaldó nada. */
  copia?: CopyEstado;
};

async function onceOrRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isCloudWaking(err)) throw err;
    await new Promise((r) => setTimeout(r, 1500));
    return fn();
  }
}

export async function syncNow(storeId: string): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, pushed: 0, pulled: 0, error: "Sin red. Los tickets siguen en este aparato." };
  }
  try {
    return await onceOrRetry(async () => {
      const pushed = await pushPending(storeId);
      const { pulled, more, started } = await pullApply(storeId);
      await saveLocalSnapshot(storeId, liveCopy());
      const copia = await saveBlob(storeId);
      return { ok: true, pushed, pulled: pulled + copia.pulled, more, started, copia: copia.estado };
    });
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

/**
 * Tope del respaldo entero. El gzip ya tiene el suyo, pero cualquier otra cosa
 * que no vuelva (una corriente trabada, una promesa que nadie resuelve) dejaba
 * el botón Sincronizar girando para siempre y sin una línea en el registro.
 * Pasó dos días sin que nadie lo viera: preferimos avisar mal a no avisar.
 */
const COPIA_TIMEOUT_MS = 45_000;
const RESPALDO_TARDO = "El respaldo tardó demasiado y lo cortamos. Tocá Sincronizar de nuevo.";

/** Corre `fn` con un tope: si no vuelve a tiempo, falla en vez de colgarse. */
function conTope<T>(fn: () => Promise<T>, ms: number, mensaje: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const reloj = setTimeout(() => reject(new Error(mensaje)), ms);
    fn().then(
      (v) => { clearTimeout(reloj); resolve(v); },
      (e: unknown) => { clearTimeout(reloj); reject(e as Error); },
    );
  });
}

/**
 * Sube la fotocopia de lo que el aparato tiene ahora. Solo corre en los
 * momentos en que el kiosquero pone su trabajo a salvo: Sincronizar, el cierre
 * de turno y el cierre de la app (invariante 6). Sin red queda pendiente y sube
 * cuando vuelve.
 */
export type CopyResult = { ok: boolean; estado?: CopyEstado; error?: string; pulled?: number };

export async function pushCopy(storeId: string, opts: { juntar?: boolean } = {}): Promise<CopyResult> {
  await queueCopy(storeId, liveCopy());
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "Sin red. La fotocopia queda pendiente." };
  }
  try {
    // Las dos cosas juntas: el tope de tiempo (un respaldo que no vuelve falla
    // en vez de colgarse) y el estado (no subir no es lo mismo que subir).
    const { estado, pulled } = await conTope(() => saveBlob(storeId, opts), COPIA_TIMEOUT_MS, RESPALDO_TARDO);
    // No subió: la fotocopia queda en cola y el pendiente no se da por resuelto.
    if (estado === "sin-bajar") {
      await resolvePendingLogs(storeId, { status: "fail", detail: SIN_BAJAR });
      return { ok: false, estado, error: SIN_BAJAR };
    }
    await clearCopy(storeId);
    await resolvePendingLogs(storeId, {
      status: "done",
      hint: "El celu ya lo puede tener",
    });
    return { ok: true, estado, pulled };
  } catch (err) {
    const error = errorText(err, "No pude subir el local");
    await resolvePendingLogs(storeId, { status: "fail", detail: error });
    return { ok: false, error };
  }
}

/** Al volver la red o al abrir: sube solo si quedó una fotocopia pendiente. */
export async function flushCopy(storeId: string): Promise<CopyResult> {
  if (!(await loadCopy(storeId))) return { ok: true };
  return pushCopy(storeId);
}

/** Al cerrar el turno: sube la cinta y la fotocopia. Cuenta como sincronizar. */
export async function backupOnClose(storeId: string): Promise<CopyResult> {
  await pushQuiet(storeId).catch(() => 0);
  const r = await pushCopy(storeId);
  if (r.ok) await touchSync(storeId);
  await appendSyncLog(storeId, {
    kind: "catalog",
    title: "Respaldo al cerrar el turno",
    detail: r.ok ? "listo" : (r.error ?? "no subió"),
    status: r.ok ? "done" : "fail",
    ...(r.estado === "sin-bajar" ? { hint: SIN_BAJAR_HINT } : {}),
  });
  return r;
}

/**
 * Al cerrar o esconder la app: lo mismo, sin registro y sin contar como
 * sincronizar. Es a lo que dé: el navegador puede cortar el pedido al cerrarse.
 * Si otro aparato subió en el medio no junta (eso es bajar la cinta y lleva su
 * tiempo): la fotocopia queda pendiente para el próximo Sincronizar.
 */
export async function backupOnHide(storeId: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  await pushQuiet(storeId).catch(() => 0);
  try {
    const r = await pushCopy(storeId, { juntar: false });
    if (r.ok) return;
    await appendSyncLog(storeId, {
      kind: "catalog",
      title: "Respaldo al salir",
      detail: r.error ?? "No pude guardar el respaldo",
      status: "fail",
      ...(r.estado === "sin-bajar" ? { hint: SIN_BAJAR_HINT } : {}),
    });
  } catch (err) {
    await appendSyncLog(storeId, {
      kind: "catalog",
      title: "Respaldo al salir",
      detail: errorText(err, "No pude guardar el respaldo"),
      status: "fail",
    });
  }
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
    const live = prunePayload(snapshotKiosk(useImanStore.getState()));
    const snap = await loadLocalSnapshot(storeId);
    const local = preferLiveCopy(live, snap);
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
  opts: { phone: boolean },
): Promise<CloudReview> {
  if (opts.phone) {
    const pulled = await pullCopy(storeId);
    let sync: SyncResult | null = null;
    try {
      sync = await syncNow(storeId);
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
  const copia = await pushCopy(storeId);
  const sync = await syncNow(storeId);

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

  // Lo que bajó al juntar la fotocopia (si chocó con la de otro aparato) también bajó.
  const bajo = sync.pulled + (copia.pulled ?? 0);
  const sube =
    sync.pushed === 1 ? "Subió 1 cambio" : sync.pushed > 1 ? `Subieron ${cambios(sync.pushed)}` : "Subió todo";
  const baja = sync.started
    ? "Primera sincronización: se toma el estado actual como punto de partida"
    : bajo === 1
      ? "Bajó 1 cambio de otro aparato"
      : bajo > 1
        ? `Bajaron ${cambios(bajo)} de otros aparatos`
        : "No había nada nuevo para bajar";
  await appendSyncLog(storeId, {
    kind: "catalog",
    title: "Subido a la nube",
    // "listo" cuando no subió nada era la mitad de la mentira: esta línea habla
    // de la cinta, y el respaldo se dice aparte, abajo.
    detail: sync.pushed > 0 ? cambios(sync.pushed) : "sin cambios nuevos",
    status: "done",
    hint: "El celu ya lo puede tener",
  });
  // El respaldo es otra cosa que la cinta. Si no subió, se dice y se ve en rojo.
  if (copia.estado === "sin-bajar") {
    await appendSyncLog(storeId, {
      kind: "catalog",
      title: "El respaldo no subió",
      detail: SIN_BAJAR,
      status: "fail",
      hint: SIN_BAJAR_HINT,
    });
  }
  if (!sync.started) {
    await appendSyncLog(storeId, {
      kind: bajo > 0 ? "pull" : "empty",
      title: bajo > 0 ? "Bajado de otros aparatos" : "Nada nuevo en la nube",
      detail: bajo > 0 ? cambios(bajo) : "listo",
      status: "done",
    });
  }
  const aviso = copia.estado === "sin-bajar" ? ` ${SIN_BAJAR}` : "";
  return {
    ok: true,
    newOrders: 0,
    emptyRemote: false,
    message: `${sube}. ${baja}.${aviso}${sync.more ? ` ${QUEDAN_MAS}` : ""}`,
  };
}
