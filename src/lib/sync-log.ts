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
};

export function pruneSyncLog(items: SyncLogItem[], now = Date.now()): SyncLogItem[] {
  const cut = now - SYNC_LOG_TTL_MS;
  return items.filter((x) => {
    const t = new Date(x.at).getTime();
    return Number.isFinite(t) && t >= cut;
  });
}

export function formatSyncLogLine(item: SyncLogItem): string {
  if (item.status === "pending") return `${item.title} — ${item.detail}`;
  if (item.status === "done") return `${item.title} — ${item.detail} — listo`;
  return `${item.title} — ${item.detail}`;
}
