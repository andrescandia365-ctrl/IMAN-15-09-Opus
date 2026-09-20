import type { ImanEvent } from "./events.ts";

/**
 * La tanda de eventos armada como un solo INSERT. Antes `pushEvents` hacía un
 * viaje a Neon por evento: una tanda de 200 eran 200 viajes seguidos dentro de
 * la misma invocación, con 30 s de presupuesto.
 *
 * `accepted` son todos los eventos válidos, no solo las filas nuevas: uno que
 * ya estaba en la cinta también está subido, y el aparato lo marca como tal
 * (ver `markAcked`). Los que no tienen id o tipo no entran ni se confirman.
 *
 * `user_id` y `store_id` son los mismos para toda la tanda y van una sola vez,
 * en $1 y $2, repetidos en cada tupla.
 */
export function eventRows(
  userId: string,
  storeId: string,
  events: ImanEvent[],
): { text: string; params: unknown[]; accepted: string[] } {
  const accepted: string[] = [];
  const visto = new Set<string>();
  const params: unknown[] = [userId, storeId];
  const tuplas: string[] = [];
  for (const ev of events) {
    if (!ev?.id || !ev.type) continue;
    accepted.push(ev.id);
    // El mismo id dos veces en una tanda entra una vez sola.
    if (visto.has(ev.id)) continue;
    visto.add(ev.id);
    const i = params.length;
    params.push(ev.id, ev.at, ev.deviceId || "dev", ev.type, JSON.stringify(ev.body ?? {}));
    tuplas.push(`($1, $2, $${i + 1}, $${i + 2}::timestamptz, $${i + 3}, $${i + 4}, $${i + 5}::jsonb)`);
  }
  if (!tuplas.length) return { text: "", params: [], accepted };
  return {
    text:
      `insert into kiosk_event (user_id, store_id, event_id, at, device_id, type, body)\n` +
      `values ${tuplas.join(", ")}\n` +
      `on conflict (user_id, store_id, event_id) do nothing`,
    params,
    accepted,
  };
}
