export const SYNC_LOG_TTL_MS = 2 * 86_400_000;

export type SyncLogKind = "order" | "catalog" | "pull" | "empty";
export type SyncLogStatus = "pending" | "done" | "fail";

export type SyncLogItem = {
  id: string;
  at: string;
  kind: SyncLogKind;
  title: string;
  detail: string;
  status: SyncLogStatus;
  hint?: string;
  /**
   * Una línea que no vence: explica algo que pasó una sola vez (el punto de
   * partida de un aparato) y tiene que seguir ahí meses después.
   */
  keep?: boolean;
};

/** Cuántas líneas comunes se guardan. Las que no vencen van aparte. */
export const SYNC_LOG_MAX = 40;

export function pruneSyncLog(items: SyncLogItem[], now = Date.now()): SyncLogItem[] {
  const cut = now - SYNC_LOG_TTL_MS;
  return items.filter((x) => {
    if (x.keep) return true;
    const t = new Date(x.at).getTime();
    return Number.isFinite(t) && t >= cut;
  });
}

/** Poda por edad y deja las últimas líneas comunes; las que no vencen quedan siempre. */
export function trimSyncLog(items: SyncLogItem[], now = Date.now(), max = SYNC_LOG_MAX): SyncLogItem[] {
  let comunes = 0;
  return pruneSyncLog(items, now).filter((x) => x.keep || comunes++ < max);
}

export function formatSyncLogLine(item: SyncLogItem): string {
  if (item.status === "pending") return `${item.title} — ${item.detail}`;
  if (item.status === "done") return `${item.title} — ${item.detail} — listo`;
  return `${item.title} — ${item.detail}`;
}

/** "hace 2 h", para la línea de la última vez que el aparato puso su trabajo a salvo. */
export function haceCuanto(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}
