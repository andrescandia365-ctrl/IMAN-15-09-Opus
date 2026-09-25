import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db.server";
import { FOUNDER_EMAIL } from "@/lib/founder-public";
import { assertEstudio, localeCapFor, MAX_LOCALES } from "@/lib/license";
import { clampSeats, PLAN_LABEL, type PlanMonths } from "@/lib/plan";

export type CrmUser = {
  id: string;
  email: string;
  name: string;
  plan: string;
  daysLeft: number;
  locales: number;
  extraSeats: number;
  seatsAllowed: number;
  canAddLocal: boolean;
};

function asIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

function planName(opts: {
  months: number | null;
  planExpires: string | null;
  trialExpires: string | null;
}): string {
  const now = Date.now();
  if (opts.planExpires && new Date(opts.planExpires).getTime() > now && opts.months) {
    if (opts.months === 12 || opts.months === 24 || opts.months === 36) {
      return PLAN_LABEL[opts.months as PlanMonths];
    }
    return `${opts.months} meses`;
  }
  if (opts.trialExpires && new Date(opts.trialExpires).getTime() > now) return "Prueba";
  if (opts.planExpires) return "Vencido";
  if (opts.trialExpires) return "Prueba vencida";
  return "Sin plan";
}

type RawRow = {
  id: string;
  email: string;
  name: string;
  locales: number;
  extra_seats: number;
  months: number | null;
  seats: number | null;
  plan_expires: unknown;
  trial_expires: unknown;
};

function seatsFromRow(r: RawRow): number {
  const now = Date.now();
  const extra = Math.max(0, Number(r.extra_seats ?? 0));
  const planExpires = asIso(r.plan_expires);
  const trialExpires = asIso(r.trial_expires);
  const planActive = Boolean(planExpires && new Date(planExpires).getTime() > now);
  const trialActive = Boolean(trialExpires && new Date(trialExpires).getTime() > now);
  const base = planActive ? clampSeats(Number(r.seats) || 1) : trialActive ? 1 : 0;
  return Math.min(MAX_LOCALES, base + extra);
}

function mapRow(r: RawRow): CrmUser {
  const planExpires = asIso(r.plan_expires);
  const trialExpires = asIso(r.trial_expires);
  const plan = planName({
    months: r.months == null ? null : Number(r.months),
    planExpires,
    trialExpires,
  });
  const activeIso =
    planExpires && new Date(planExpires).getTime() > Date.now()
      ? planExpires
      : trialExpires && new Date(trialExpires).getTime() > Date.now()
        ? trialExpires
        : null;
  const extraSeats = Math.max(0, Number(r.extra_seats ?? 0));
  const seatsAllowed = seatsFromRow(r);
  const locales = Number(r.locales ?? 0);
  return {
    id: r.id,
    email: r.email,
    name: r.name || r.email,
    plan,
    daysLeft: daysLeft(activeIso),
    locales,
    extraSeats,
    seatsAllowed,
    canAddLocal: seatsAllowed < MAX_LOCALES,
  };
}

async function loadUsers(): Promise<CrmUser[]> {
  const sql = await getSql();
  await sql`
    insert into iman_trials (user_id, started_at, expires_at)
    select o.user_id, o.created_at, o.created_at + interval '19 days'
    from iman_owners o
    where lower(o.email) <> ${FOUNDER_EMAIL}
      and not exists (select 1 from iman_trials t where t.user_id = o.user_id)
    on conflict (user_id) do nothing
  `;
  const rows = await sql<RawRow>`
    select
      o.user_id as id,
      o.email,
      o.name,
      coalesce((select count(*)::int from kiosk_store s where s.user_id = o.user_id), 0) as locales,
      coalesce(o.extra_seats, a.extra_seats, 0)::int as extra_seats,
      l.months,
      coalesce(l.seats, 1) as seats,
      l.expires_at as plan_expires,
      t.expires_at as trial_expires
    from iman_owners o
    left join kiosk_account a on a.user_id = o.user_id
    left join iman_trials t on t.user_id = o.user_id
    left join iman_licenses l on l.code = (
      select code from iman_licenses
      where redeemed_by = o.user_id
      order by expires_at desc nulls last
      limit 1
    )
    where lower(o.email) <> ${FOUNDER_EMAIL}
    order by o.created_at desc
  `;
  return rows.map(mapRow);
}

async function loadUser(userId: string): Promise<CrmUser> {
  const all = await loadUsers();
  const found = all.find((u) => u.id === userId);
  if (!found) throw new Error("Esa cuenta no está");
  return found;
}

export const listCrmUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CrmUser[]> => {
    await assertEstudio(context.userId);
    return loadUsers();
  });

export type CobraEnConteo = { computadora: number; tablet: number; celu: number; sinResponder: number };

/** Cuántos locales eligieron cada opción de "¿Dónde vas a cobrar?". */
export const countCobraEn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CobraEnConteo> => {
    await assertEstudio(context.userId);
    const sql = await getSql();
    const rows = await sql<{ cobra_en: string | null; n: number | string }>`
      select cobra_en, count(*)::int as n from kiosk_store group by cobra_en
    `;
    const out: CobraEnConteo = { computadora: 0, tablet: 0, celu: 0, sinResponder: 0 };
    for (const r of rows) {
      const n = Number(r.n) || 0;
      if (r.cobra_en === "computadora" || r.cobra_en === "tablet" || r.cobra_en === "celu") out[r.cobra_en] += n;
      else out.sinResponder += n;
    }
    return out;
  });

export const grantExtraLocal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { userId: string }) => {
    const userId = String(data?.userId ?? "").trim();
    if (!userId) throw new Error("Falta la cuenta");
    return { userId };
  })
  .handler(async ({ context, data }): Promise<CrmUser> => {
    await assertEstudio(context.userId);
    if (data.userId === context.userId) throw new Error("El local de Estudio no se mezcla con un dueño");
    const sql = await getSql();
    const owner = await sql<{ user_id: string }>`
      select user_id from iman_owners where user_id = ${data.userId} limit 1
    `;
    if (!owner[0]) throw new Error("Esa cuenta no está");
    const cap = await localeCapFor(data.userId);
    if (cap >= MAX_LOCALES) throw new Error("Techo de 5 locales");
    await sql`
      update iman_owners
      set extra_seats = extra_seats + 1, updated_at = now()
      where user_id = ${data.userId}
    `;
    await sql`
      insert into kiosk_account (user_id, active_store_id, extra_seats)
      values (${data.userId}, 's1', 1)
      on conflict (user_id) do update set
        extra_seats = kiosk_account.extra_seats + 1,
        updated_at = now()
    `;
    const next = await localeCapFor(data.userId);
    if (next > MAX_LOCALES) {
      await sql`
        update iman_owners
        set extra_seats = greatest(extra_seats - 1, 0), updated_at = now()
        where user_id = ${data.userId}
      `;
      await sql`
        update kiosk_account
        set extra_seats = greatest(extra_seats - 1, 0), updated_at = now()
        where user_id = ${data.userId}
      `;
      throw new Error("Techo de 5 locales");
    }
    return loadUser(data.userId);
  });

export const resetOwnerPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { userId: string }) => {
    const userId = String(data?.userId ?? "").trim();
    if (!userId) throw new Error("Falta la cuenta");
    return { userId };
  })
  .handler(async ({ context, data }): Promise<{ password: string }> => {
    await assertEstudio(context.userId);
    if (data.userId === context.userId) throw new Error("No resetees la clave del Estudio acá");
    const sql = await getSql();
    const owners = await sql<{ user_id: string }>`
      select user_id from iman_owners where user_id = ${data.userId} limit 1
    `;
    if (!owners[0]) throw new Error("Esa cuenta no está");
    const password = `iman-${1000 + (randomBytes(2).readUInt16BE(0) % 9000)}`;
    const hash = await hashPassword(password);
    const acc = await sql<{ id: string }>`
      select id from "account"
      where "userId" = ${data.userId} and "providerId" = 'credential'
      limit 1
    `;
    if (!acc[0]) {
      const accId = `acc_${randomBytes(12).toString("hex")}`;
      await sql`
        insert into "account" (
          id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
        )
        values (${accId}, ${data.userId}, 'credential', ${data.userId}, ${hash}, now(), now())
      `;
    } else {
      await sql`
        update "account"
        set password = ${hash}, "updatedAt" = now()
        where id = ${acc[0].id}
      `;
    }
    await sql`delete from "session" where "userId" = ${data.userId}`;
    return { password };
  });

export const resetOwnerPin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { userId: string }) => {
    const userId = String(data?.userId ?? "").trim();
    if (!userId) throw new Error("Falta la cuenta");
    return { userId };
  })
  .handler(async ({ context, data }): Promise<{ ok: true; stores: number }> => {
    await assertEstudio(context.userId);
    if (data.userId === context.userId) throw new Error("El PIN de Estudio no se toca acá");
    const sql = await getSql();
    const updated = await sql<{ store_id: string }>`
      update kiosk_store
      set
        payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{settings,ownerPinHash}', '""'::jsonb, true),
        updated_at = now()
      where user_id = ${data.userId}
      returning store_id
    `;
    return { ok: true, stores: updated.length };
  });
