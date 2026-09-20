import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { MAX_JSON_BYTES, prunePayload } from "@/lib/cap";
import { LOCAL_TOO_HEAVY } from "@/lib/errors";
import { startOfDay } from "@/lib/format";
import { eventRows } from "@/lib/event-rows";
import { blankKiosk, MAX_STORES } from "@/lib/kiosk-blank";
import { localeCapFor } from "@/lib/license";
import type { KioskPayload, Sale } from "@/lib/types";
import type { ImanEvent } from "@/lib/events";

export type StoreMeta = {
  id: string;
  name: string;
  alias: string;
  updatedAt: string;
};

export type AccountBundle = {
  stores: StoreMeta[];
  activeStoreId: string;
  payload: KioskPayload;
  rev: number;
};

export type StoreRollup = {
  id: string;
  name: string;
  todayTotal: number;
  todayTickets: number;
  monthTotal: number;
};

function isPayload(value: unknown): value is KioskPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.products) &&
    Array.isArray(v.categories) &&
    Array.isArray(v.sales) &&
    Array.isArray(v.suppliers) &&
    Array.isArray(v.shifts) &&
    v.settings != null &&
    typeof v.settings === "object"
  );
}

function parsePayload(raw: unknown): KioskPayload | null {
  if (raw == null) return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return null;
    }
  }
  return isPayload(parsed) ? parsed : null;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

async function listMeta(userId: string): Promise<StoreMeta[]> {
  const sql = await getSql();
  const rows = await sql<{ store_id: string; name: string; alias: string; updated_at: unknown }>`
    select store_id, name, coalesce(alias, '') as alias, updated_at from kiosk_store
    where user_id = ${userId}
    order by created_at asc
  `;
  return rows.map((r) => ({
    id: r.store_id,
    name: r.name,
    alias: r.alias || r.name,
    updatedAt: asIso(r.updated_at),
  }));
}

async function migrateLegacy(userId: string): Promise<void> {
  const sql = await getSql();
  const existing = await sql<{ n: number }>`
    select count(*)::int as n from kiosk_store where user_id = ${userId}
  `;
  if ((existing[0]?.n ?? 0) > 0) return;
  const legacy = await sql<{ payload: unknown }>`
    select payload from kiosk_state where user_id = ${userId} limit 1
  `;
  if (!legacy[0]) return;
  const parsed = parsePayload(legacy[0].payload);
  if (!parsed) return;
  const id = "s1";
  const name = parsed.settings?.name?.trim() || "Local";
  await sql`
    insert into kiosk_store (user_id, store_id, name, payload)
    values (${userId}, ${id}, ${name}, CAST(${JSON.stringify(parsed)} AS jsonb))
  `;
  await sql`
    insert into kiosk_account (user_id, active_store_id)
    values (${userId}, ${id})
    on conflict (user_id) do update set active_store_id = excluded.active_store_id
  `;
}

function pack(payload: KioskPayload): { json: string; name: string } {
  const pruned = prunePayload(payload);
  const json = JSON.stringify(pruned);
  if (json.length > MAX_JSON_BYTES) {
    throw new Error(LOCAL_TOO_HEAVY);
  }
  return { json, name: pruned.settings.name.trim() || "Local" };
}

async function readStore(
  userId: string,
  storeId: string,
): Promise<{ payload: KioskPayload; rev: number } | null> {
  const sql = await getSql();
  const rows = await sql<{ payload: unknown; rev: number | null }>`
    select payload, coalesce(rev, 0) as rev from kiosk_store
    where user_id = ${userId} and store_id = ${storeId}
    limit 1
  `;
  if (!rows[0]) return null;
  const payload = parsePayload(rows[0].payload);
  if (!payload) return null;
  return { payload, rev: Number(rows[0].rev ?? 0) };
}

async function readPayload(userId: string, storeId: string): Promise<KioskPayload | null> {
  const row = await readStore(userId, storeId);
  return row?.payload ?? null;
}

export const loadAccount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AccountBundle | null> => {
    await migrateLegacy(context.userId);
    const sql = await getSql();
    const stores = await listMeta(context.userId);
    if (!stores.length) return null;
    const acc = await sql<{ active_store_id: string }>`
      select active_store_id from kiosk_account where user_id = ${context.userId} limit 1
    `;
    let activeStoreId = acc[0]?.active_store_id ?? stores[0]!.id;
    if (!stores.some((s) => s.id === activeStoreId)) activeStoreId = stores[0]!.id;
    const row = await readStore(context.userId, activeStoreId);
    if (!row) return null;
    return { stores, activeStoreId, payload: row.payload, rev: row.rev };
  });

export const saveStore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { storeId: string; payload: KioskPayload }) => {
    if (!data?.storeId || !isPayload(data.payload)) throw new Error("Invalid store");
    return data;
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const packed = pack(data.payload);
    await sql`
      insert into kiosk_store (user_id, store_id, name, payload, updated_at)
      values (${context.userId}, ${data.storeId}, ${packed.name}, CAST(${packed.json} AS jsonb), now())
      on conflict (user_id, store_id) do update
        set payload = excluded.payload, name = excluded.name, updated_at = now()
    `;
    await sql`
      insert into kiosk_account (user_id, active_store_id)
      values (${context.userId}, ${data.storeId})
      on conflict (user_id) do update set active_store_id = excluded.active_store_id, updated_at = now()
    `;
    return { ok: true as const };
  });

export const addStore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { name: string; alias?: string; catalog: "example" | "empty"; city?: string }) => {
    const name = (data?.name ?? "").trim().slice(0, 40);
    const alias = (data?.alias ?? "").trim().slice(0, 24);
    const catalog = data?.catalog === "empty" ? "empty" : "example";
    const city = String(data?.city ?? "").trim().slice(0, 40);
    if (!name) throw new Error("Falta el nombre del local");
    return { name, alias: alias || name, catalog, city } as const;
  })
  .handler(async ({ context, data }): Promise<AccountBundle> => {
    await migrateLegacy(context.userId);
    const stores = await listMeta(context.userId);
    const cap = await localeCapFor(context.userId);
    if (stores.length >= cap) {
      throw new Error(
        cap <= 0
          ? "Activá el plan para abrir un local"
          : `Máximo ${cap} ${cap === 1 ? "local" : "locales"} por cuenta`,
      );
    }
    const storeId = `s${Date.now().toString(36)}`;
    const payload = blankKiosk(data.name, data.catalog, data.city);
    const saved = await saveActive(context.userId, storeId, payload);
    const sql = await getSql();
    await sql`
      update kiosk_store set alias = ${data.alias}
      where user_id = ${context.userId} and store_id = ${storeId}
    `;
    const next = await listMeta(context.userId);
    return { stores: next, activeStoreId: storeId, payload, rev: saved.ok ? saved.rev : 1 };
  });

export const registerLocals = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { locals: { name: string; alias: string; city?: string }[] }) => {
    const locals = Array.isArray(data?.locals) ? data.locals : [];
    const cleaned = locals
      .map((l) => ({
        name: String(l?.name ?? "").trim().slice(0, 40),
        alias: String(l?.alias ?? "").trim().slice(0, 24),
        city: String(l?.city ?? "").trim().slice(0, 40),
      }))
      .filter((l) => l.name)
      .map((l) => ({ ...l, alias: l.alias || l.name }));
    if (!cleaned.length) throw new Error("Registrá al menos un local");
    if (cleaned.length > MAX_STORES) throw new Error(`Máximo ${MAX_STORES} locales`);
    return { locals: cleaned };
  })
  .handler(async ({ context, data }): Promise<AccountBundle> => {
    await migrateLegacy(context.userId);
    const existing = await listMeta(context.userId);
    const cap = await localeCapFor(context.userId);
    if (existing.length + data.locals.length > cap) {
      throw new Error(
        cap <= 0
          ? "Activá el plan para abrir un local"
          : `Máximo ${cap} ${cap === 1 ? "local" : "locales"} por cuenta`,
      );
    }
    const sql = await getSql();
    let firstId = existing[0]?.id ?? "";
    let firstPayload: KioskPayload | null = null;
    let firstRev = 0;
    for (let i = 0; i < data.locals.length; i += 1) {
      const loc = data.locals[i]!;
      const storeId = `s${Date.now().toString(36)}${i}`;
      const payload = blankKiosk(loc.name, "empty", loc.city);
      const saved = await saveActive(context.userId, storeId, payload);
      await sql`
        update kiosk_store set alias = ${loc.alias}
        where user_id = ${context.userId} and store_id = ${storeId}
      `;
      if (!firstId) {
        firstId = storeId;
        firstPayload = payload;
        firstRev = saved.ok ? saved.rev : 1;
      }
    }
    await sql`
      insert into kiosk_account (user_id, active_store_id)
      values (${context.userId}, ${firstId})
      on conflict (user_id) do update set active_store_id = excluded.active_store_id, updated_at = now()
    `;
    const payload = firstPayload ?? (await readPayload(context.userId, firstId));
    if (!payload) throw new Error("No se pudo abrir el local");
    return { stores: await listMeta(context.userId), activeStoreId: firstId, payload, rev: firstRev };
  });

export const saveOwnerProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { name?: string; phone?: string }) => ({
    name: String(data?.name ?? "").trim().slice(0, 80),
    phone: String(data?.phone ?? "").trim().slice(0, 24),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into kiosk_account (user_id, active_store_id, owner_name, phone)
      values (${context.userId}, 's1', ${data.name}, ${data.phone})
      on conflict (user_id) do update set
        owner_name = case when ${data.name} = '' then kiosk_account.owner_name else excluded.owner_name end,
        phone = case when ${data.phone} = '' then kiosk_account.phone else excluded.phone end,
        updated_at = now()
    `;
    return { ok: true as const };
  });

export const selectStore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { storeId: string }) => {
    if (!data?.storeId) throw new Error("Falta el local");
    return { storeId: data.storeId };
  })
  .handler(async ({ context, data }): Promise<AccountBundle> => {
    const row = await readStore(context.userId, data.storeId);
    if (!row) throw new Error("Ese local no existe");
    const sql = await getSql();
    await sql`
      insert into kiosk_account (user_id, active_store_id)
      values (${context.userId}, ${data.storeId})
      on conflict (user_id) do update set active_store_id = excluded.active_store_id, updated_at = now()
    `;
    const stores = await listMeta(context.userId);
    return { stores, activeStoreId: data.storeId, payload: row.payload, rev: row.rev };
  });

export const groupRollup = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ stores: StoreRollup[]; todayTotal: number; monthTotal: number }> => {
    await migrateLegacy(context.userId);
    const sql = await getSql();
    const rows = await sql<{ store_id: string; name: string; payload: unknown }>`
      select store_id, name, payload from kiosk_store where user_id = ${context.userId}
      order by created_at asc
    `;
    const start = startOfDay();
    const stores: StoreRollup[] = rows.map((r) => {
      const p = parsePayload(r.payload);
      const sales: Sale[] = p?.sales ?? [];
      const today = sales.filter((s) => new Date(s.createdAt) >= start);
      const monthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
      const monthSales = sales.filter((s) => s.createdAt.slice(0, 7) === monthKey);
      const folded = (p?.monthAggs ?? []).find((a) => a.ym === monthKey);
      const monthLive = monthSales.reduce((a, s) => a + s.total, 0);
      return {
        id: r.store_id,
        name: r.name,
        todayTotal: today.reduce((a, s) => a + s.total, 0),
        todayTickets: today.length,
        monthTotal: monthLive + (folded?.ventas ?? 0),
      };
    });
    return {
      stores,
      todayTotal: stores.reduce((a, s) => a + s.todayTotal, 0),
      monthTotal: stores.reduce((a, s) => a + s.monthTotal, 0),
    };
  });

/** First save after onboarding when the account has no stores yet. */
export const bootstrapStore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: KioskPayload) => {
    if (!isPayload(data)) throw new Error("Invalid kiosk payload");
    return data;
  })
  .handler(async ({ context, data }): Promise<AccountBundle> => {
    await migrateLegacy(context.userId);
    const existing = await listMeta(context.userId);
    if (existing.length) {
      const active = existing[0]!.id;
      const saved = await saveActive(context.userId, active, data);
      return {
        stores: await listMeta(context.userId),
        activeStoreId: active,
        payload: data,
        rev: saved.ok ? saved.rev : 0,
      };
    }
    const storeId = "s1";
    const saved = await saveActive(context.userId, storeId, data);
    return {
      stores: await listMeta(context.userId),
      activeStoreId: storeId,
      payload: prunePayload(data),
      rev: saved.ok ? saved.rev : 1,
    };
  });

async function saveActive(
  userId: string,
  storeId: string,
  payload: KioskPayload,
  expectedRev?: number,
): Promise<
  | { ok: true; rev: number }
  | { ok: false; stale: true; rev: number; payload: KioskPayload }
> {
  const sql = await getSql();
  const packed = pack(payload);
  if (expectedRev == null) {
    const rows = await sql<{ rev: number }>`
      insert into kiosk_store (user_id, store_id, name, payload, rev, updated_at)
      values (${userId}, ${storeId}, ${packed.name}, CAST(${packed.json} AS jsonb), 1, now())
      on conflict (user_id, store_id) do update
        set payload = excluded.payload,
            name = excluded.name,
            rev = kiosk_store.rev + 1,
            updated_at = now()
      returning rev
    `;
    await sql`
      insert into kiosk_account (user_id, active_store_id)
      values (${userId}, ${storeId})
      on conflict (user_id) do update set active_store_id = excluded.active_store_id, updated_at = now()
    `;
    return { ok: true, rev: Number(rows[0]?.rev ?? 1) };
  }
  const updated = await sql<{ rev: number }>`
    update kiosk_store
    set payload = CAST(${packed.json} AS jsonb),
        name = ${packed.name},
        rev = rev + 1,
        updated_at = now()
    where user_id = ${userId} and store_id = ${storeId} and rev = ${expectedRev}
    returning rev
  `;
  if (updated[0]) {
    await sql`
      insert into kiosk_account (user_id, active_store_id)
      values (${userId}, ${storeId})
      on conflict (user_id) do update set active_store_id = excluded.active_store_id, updated_at = now()
    `;
    return { ok: true, rev: Number(updated[0].rev) };
  }
  const cur = await readStore(userId, storeId);
  if (!cur) {
    const ins = await sql<{ rev: number }>`
      insert into kiosk_store (user_id, store_id, name, payload, rev, updated_at)
      values (${userId}, ${storeId}, ${packed.name}, CAST(${packed.json} AS jsonb), 1, now())
      returning rev
    `;
    return { ok: true, rev: Number(ins[0]?.rev ?? 1) };
  }
  return { ok: false, stale: true, rev: cur.rev, payload: cur.payload };
}

export const loadKiosk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const acc = await migrateAndLoad(context.userId);
    return acc?.payload ?? null;
  });

async function migrateAndLoad(userId: string): Promise<AccountBundle | null> {
  await migrateLegacy(userId);
  const stores = await listMeta(userId);
  if (!stores.length) return null;
  const sql = await getSql();
  const acc = await sql<{ active_store_id: string }>`
    select active_store_id from kiosk_account where user_id = ${userId} limit 1
  `;
  let activeStoreId = acc[0]?.active_store_id ?? stores[0]!.id;
  if (!stores.some((s) => s.id === activeStoreId)) activeStoreId = stores[0]!.id;
  const row = await readStore(userId, activeStoreId);
  if (!row) return null;
  return { stores, activeStoreId, payload: row.payload, rev: row.rev };
}

type SaveKioskIn =
  | KioskPayload
  | { storeId?: string; payload: KioskPayload; rev?: number }
  | { storeId?: string; gzip: string; rev?: number };

export const saveKiosk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: SaveKioskIn) => {
    if (data && typeof data === "object" && "payload" in data && isPayload((data as { payload: unknown }).payload)) {
      const d = data as { storeId?: string; payload: KioskPayload; rev?: number };
      return { storeId: d.storeId ?? "", payload: d.payload, gzip: undefined as string | undefined, rev: d.rev };
    }
    if (data && typeof data === "object" && typeof (data as { gzip?: unknown }).gzip === "string") {
      const d = data as { storeId?: string; gzip: string; rev?: number };
      return { storeId: d.storeId ?? "", payload: undefined as KioskPayload | undefined, gzip: d.gzip, rev: d.rev };
    }
    if (isPayload(data)) return { storeId: "", payload: data, gzip: undefined as string | undefined, rev: undefined as number | undefined };
    throw new Error("Invalid kiosk payload");
  })
  .handler(async ({ context, data }) => {
    let payload = data.payload;
    if (!payload && data.gzip) {
      const { gunzipB64ToJson } = await import("@/lib/copy-gzip.server");
      const parsed = gunzipB64ToJson(data.gzip);
      if (!isPayload(parsed)) throw new Error("Invalid kiosk payload");
      payload = parsed;
    }
    if (!payload) throw new Error("Invalid kiosk payload");
    let storeId = data.storeId;
    if (!storeId) {
      const acc = await migrateAndLoad(context.userId);
      storeId = acc?.activeStoreId ?? "s1";
    }
    return saveActive(context.userId, storeId, payload, data.rev);
  });

function asEvent(row: {
  event_id: string;
  at: string | Date;
  device_id: string;
  type: string;
  body: unknown;
  store_id: string;
}): ImanEvent {
  const at = row.at instanceof Date ? row.at.toISOString() : String(row.at);
  return {
    id: row.event_id,
    at,
    deviceId: row.device_id,
    storeId: row.store_id,
    type: row.type as ImanEvent["type"],
    body: (row.body ?? {}) as ImanEvent["body"],
  };
}

export const pushEvents = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { storeId: string; events: ImanEvent[] }) => {
    if (!data?.storeId || !Array.isArray(data.events)) throw new Error("Invalid events");
    return {
      storeId: data.storeId,
      events: data.events.slice(0, 400),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    // Una sola ida a Neon por tanda. Solo se confirma lo que entró: el aparato
    // marca como subido exactamente esto, así un recorte del servidor no borra
    // ventas del local (ver event-rows.ts).
    const { text, params, accepted } = eventRows(context.userId, data.storeId, data.events);
    if (text) await sql.query(text, params);
    return { ok: true as const, n: accepted.length, accepted };
  });

const PULL_PAGE = 500;

export const pullEvents = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { storeId: string; after?: string; afterSeq?: number }) => {
    if (!data?.storeId) throw new Error("Invalid pull");
    const afterSeq = Number(data.afterSeq);
    return {
      storeId: data.storeId,
      after: data.after || "1970-01-01T00:00:00.000Z",
      afterSeq: Number.isFinite(afterSeq) && afterSeq > 0 ? Math.floor(afterSeq) : null,
    };
  })
  .handler(
    async ({
      context,
      data,
    }): Promise<{ events: ImanEvent[]; cursor: number; hasMore: boolean }> => {
      const sql = await getSql();
      // Un aparato que viene de la versión vieja solo tiene la hora del último
      // pull. Se traduce a número de orden una vez, para no volver a aplicar
      // toda la cinta desde el principio.
      let base = data.afterSeq ?? 0;
      if (data.afterSeq == null) {
        const watermark = await sql<{ seq: number | null }>`
          select max(seq) as seq from kiosk_event
          where user_id = ${context.userId}
            and store_id = ${data.storeId}
            and at <= ${data.after}::timestamptz
        `;
        base = Number(watermark[0]?.seq ?? 0);
      }
      const rows = await sql<{
        event_id: string;
        at: string | Date;
        device_id: string;
        type: string;
        body: unknown;
        store_id: string;
        seq: number;
      }>`
        select event_id, at, device_id, type, body, store_id, seq
        from kiosk_event
        where user_id = ${context.userId}
          and store_id = ${data.storeId}
          and seq > ${base}
        order by seq asc
        limit ${PULL_PAGE}
      `;
      const cursor = rows.reduce((m, r) => Math.max(m, Number(r.seq)), base);
      return { events: rows.map(asEvent), cursor, hasMore: rows.length === PULL_PAGE };
    },
  );

