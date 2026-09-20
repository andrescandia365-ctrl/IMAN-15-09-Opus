import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db.server";
import { FOUNDER_EMAIL, isFounderEmail } from "@/lib/founder-public";
import { blankKiosk } from "@/lib/kiosk-blank";
import { TRIAL_DAYS } from "@/lib/plan";

export type ClaimedOwner = {
  userId: string;
  email: string;
  name: string;
  storeId: string;
  trialExpiresAt: string;
};

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value ?? ""));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * De servidor, exportada plana porque la llama `license` al canjear. Sin
 * marcarla viaja al navegador con la base atrás: `login-screen` importa
 * `claimOwner` de este mismo archivo, así que todo el módulo cruza.
 */
export const claimOwnerRow = createServerOnlyFn(async (
  userId: string,
  opts?: { name?: string },
): Promise<ClaimedOwner> => {
  const sql = await getSql();
  const users = await sql<{ email: string; name: string; createdAt: unknown }>`
    select email, name, "createdAt" as "createdAt" from "user" where id = ${userId} limit 1
  `;
  const row = users[0];
  if (!row?.email) throw new Error("No hay mail en la cuenta");
  const email = row.email.trim().toLowerCase();
  if (isFounderEmail(email) || email === FOUNDER_EMAIL) {
    throw new Error("El Estudio no se mezcla con un dueño");
  }
  const name = (opts?.name ?? row.name ?? "").trim() || email;

  await sql`
    insert into iman_owners (user_id, email, name, extra_seats, created_at, updated_at)
    values (${userId}, ${email}, ${name}, 0, now(), now())
    on conflict (user_id) do update set
      email = excluded.email,
      name = case when excluded.name = '' then iman_owners.name else excluded.name end,
      updated_at = now()
  `;

  const startIso = asIso(row.createdAt);
  const start = new Date(startIso);
  const expires = new Date(start.getTime() + TRIAL_DAYS * 86_400_000);
  await sql`
    insert into iman_trials (user_id, started_at, expires_at)
    values (${userId}, ${start.toISOString()}, ${expires.toISOString()})
    on conflict (user_id) do nothing
  `;
  const trial = await sql<{ expires_at: unknown }>`
    select expires_at from iman_trials where user_id = ${userId} limit 1
  `;

  const existing = await sql<{ store_id: string }>`
    select store_id from kiosk_store where user_id = ${userId} order by created_at asc limit 1
  `;
  let storeId = existing[0]?.store_id ?? "";
  if (!storeId) {
    storeId = "s1";
    const payload = blankKiosk("Local", "empty", "");
    const json = JSON.stringify(payload);
    await sql`
      insert into kiosk_store (user_id, store_id, name, payload, rev, updated_at)
      values (${userId}, ${storeId}, 'Local', CAST(${json} AS jsonb), 1, now())
      on conflict (user_id, store_id) do nothing
    `;
    await sql`
      insert into kiosk_account (user_id, active_store_id)
      values (${userId}, ${storeId})
      on conflict (user_id) do update set active_store_id = excluded.active_store_id, updated_at = now()
    `;
  } else {
    await sql`
      insert into kiosk_account (user_id, active_store_id)
      values (${userId}, ${storeId})
      on conflict (user_id) do nothing
    `;
  }

  return {
    userId,
    email,
    name,
    storeId,
    trialExpiresAt: asIso(trial[0]?.expires_at) || expires.toISOString(),
  };
});

export const claimOwner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { name?: string } | undefined) => ({
    name: String(data?.name ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ context, data }): Promise<ClaimedOwner> => {
    return claimOwnerRow(context.userId, { name: data.name });
  });
