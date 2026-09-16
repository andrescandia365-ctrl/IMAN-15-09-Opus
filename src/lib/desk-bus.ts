import type { DeskTicket } from "@/lib/desk-ticket";

type Sub = (ticket: DeskTicket) => void;

const g = globalThis as typeof globalThis & {
  __imanDeskBus__?: Map<string, Set<Sub>>;
};

function bus(): Map<string, Set<Sub>> {
  g.__imanDeskBus__ ??= new Map();
  return g.__imanDeskBus__;
}

function key(userId: string, storeId: string): string {
  return `${userId}:${storeId}`;
}

export function subscribeDesk(userId: string, storeId: string, fn: Sub): () => void {
  const k = key(userId, storeId);
  const m = bus();
  const set = m.get(k) ?? new Set<Sub>();
  set.add(fn);
  m.set(k, set);
  return () => {
    set.delete(fn);
    if (!set.size) m.delete(k);
  };
}

export function publishDeskTicket(userId: string, storeId: string, ticket: DeskTicket): void {
  const set = bus().get(key(userId, storeId));
  if (!set) return;
  for (const fn of set) {
    try {
      fn(ticket);
    } catch {
      /* drop dead subscriber */
    }
  }
}
