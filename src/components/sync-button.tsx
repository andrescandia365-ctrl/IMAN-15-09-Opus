import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { onQueueChange, listSyncLog, syncMeta, type SyncLogItem } from "@/lib/local-db";
import { reviewCloud } from "@/lib/sync";
import { usePhoneUi } from "@/lib/device";
import { cn } from "@/lib/utils";

export function SyncButton({ storeId, rev }: { storeId: string; rev?: number }) {
  const phone = usePhoneUi();
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [items, setItems] = useState<SyncLogItem[]>([]);
  const [live, setLive] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  function refreshMeta() {
    void syncMeta(storeId).then((m) => setLast(m.lastSyncAt));
    void listSyncLog(storeId).then(setItems);
  }

  useEffect(() => {
    refreshMeta();
    const off = onQueueChange(refreshMeta);
    const t = window.setInterval(() => {
      refreshMeta();
      setNow(Date.now());
    }, 60_000);
    return () => {
      off();
      window.clearInterval(t);
    };
  }, [storeId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function runReview() {
    setBusy(true);
    setChecking(true);
    if (phone) setLive("Revisando si hay trabajo en la nube");
    try {
      const r = await reviewCloud(storeId, { phone, rev });
      setLive(r.message);
      await listSyncLog(storeId).then(setItems);
      const m = await syncMeta(storeId);
      setLast(m.lastSyncAt);
      setNow(Date.now());
    } finally {
      setBusy(false);
      setChecking(false);
    }
  }

  const ageH = last ? (now - new Date(last).getTime()) / 3_600_000 : 99;
  const tone = !last || ageH >= 3 ? "text-danger" : ageH >= 2 ? "text-warn" : "text-sage";
  const Icon = !last || ageH >= 2 ? RefreshCw : Check;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-label="Sincronizar"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            refreshMeta();
            void runReview();
          }
        }}
        className={cn("grid size-10 place-items-center rounded-md hover:bg-elevated", tone)}
      >
        <Icon className={cn("size-4", busy && "animate-spin")} />
      </button>
      {open ? (
        <div className="fixed right-3 top-20 z-50 w-[min(18rem,calc(100vw-1.5rem))] whitespace-normal rounded-xl bg-surface p-3 text-fg shadow-[var(--shadow-border)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">Nube</p>
          {checking && phone ? (
            <p className="mt-2 text-sm">Revisando si hay trabajo en la nube</p>
          ) : live ? (
            <p className="mt-2 text-sm">{live}</p>
          ) : null}
          {items.length ? (
            <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto">
              {/* Las líneas que no vencen (el punto de partida) van siempre, al final. */}
              {[...items.filter((it) => !it.keep).slice(0, 12), ...items.filter((it) => it.keep)].map((it) => (
                <li key={it.id} className="text-sm leading-snug">
                  <span className="font-medium">{it.title}</span>
                  {it.status === "pending" ? (
                    <>
                      <span className="text-muted"> — {it.detail}</span>
                      <span className="text-warn"> — pendiente</span>
                    </>
                  ) : it.status === "done" ? (
                    <>
                      {it.detail && it.detail !== "listo" ? (
                        <span className="text-muted"> — {it.detail}</span>
                      ) : null}
                      <span className="text-sage"> — listo</span>
                    </>
                  ) : (
                    <span className="text-danger"> — {it.detail}</span>
                  )}
                  {it.hint && it.status === "done" ? (
                    <span className="mt-0.5 block text-xs text-subtle">{it.hint}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : !checking && !live ? (
            <p className="mt-2 text-sm text-muted">Todavía no hay eventos.</p>
          ) : null}
          <p className="mt-2 text-[11px] text-subtle">
            {items.some((it) => it.keep)
              ? "Se borran solos a los 2 días, menos el punto de partida."
              : "Se borran solos a los 2 días."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
