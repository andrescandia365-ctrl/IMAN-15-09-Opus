import { useEffect, useState } from "react";
import { listDeskInbox, takeDeskTicket, type DeskTicket } from "@/lib/desk-ticket";

/** PC till: one fetch when the session is here. No SSE, no polling loop. */
export function useDeskInbox(storeId: string, enabled: boolean) {
  const [incoming, setIncoming] = useState<DeskTicket | null>(null);

  useEffect(() => {
    if (!enabled || !storeId || typeof window === "undefined") return;
    let dead = false;

    async function pull() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      try {
        const r = await listDeskInbox({ data: { storeId } });
        if (!dead && r.tickets[0]) setIncoming(r.tickets[0]);
      } catch {
        /* next focus will retry */
      }
    }

    void pull();
    const onVis = () => {
      if (document.visibilityState === "visible") void pull();
    };
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dead = true;
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [storeId, enabled]);

  async function accept() {
    if (!incoming) return null;
    const t = incoming;
    try {
      await takeDeskTicket({ data: { storeId, ticketId: t.id } });
    } catch {
      /* still load locally */
    }
    setIncoming(null);
    return t;
  }

  function dismiss() {
    if (incoming) {
      void takeDeskTicket({ data: { storeId, ticketId: incoming.id } }).catch(() => undefined);
    }
    setIncoming(null);
  }

  return { incoming, accept, dismiss };
}
