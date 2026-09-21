import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db.server";
import { FOUNDER_EMAIL, isFounderEmail } from "@/lib/founder-public";
import {
  attachLicenseChecksum,
  clampSeats,
  isPlanMonths,
  isPlanSeats,
  LICENSE_ALPHABET,
  MAX_LOCALES,
  monthsFromSku,
  normalizeLicenseCode,
  seatsForPlan,
  TRIAL_DAYS,
  type PlanMonths,
} from "@/lib/plan";

export { MAX_LOCALES, TRIAL_DAYS } from "@/lib/plan";

export type VendorPublic = {
  claimed: boolean;
  sellerName: string;
  salesUrl: string;
};

export type LicensePeek = {
  ok: boolean;
  code: string;
  months: number | null;
  seats: number | null;
  used: boolean;
  error: string | null;
};

export type LicenseRow = {
  code: string;
  months: number;
  seats: number;
  createdAt: string;
  redeemedAt: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  redeemedEmail: string | null;
  redeemedName: string | null;
  wooOrderId: string | null;
  cancelledAt: string | null;
};

export type MyAccess = {
  isVendor: boolean;
  vendorClaimed: boolean;
  sellerName: string;
  salesUrl: string;
  hasShopSecret: boolean;
  extraSeats: number;
  seatsAllowed: number;
  trial: {
    startedAt: string;
    expiresAt: string;
    active: boolean;
  } | null;
  license: {
    code: string;
    months: number;
    seats: number;
    startsAt: string;
    expiresAt: string;
    active: boolean;
  } | null;
};

type VendorRow = {
  user_id: string;
  seller_name: string;
  sales_url: string;
  shop_secret: string;
};
type LicenseDb = {
  code: string;
  months: number;
  created_at: unknown;
  redeemed_at: unknown;
  starts_at: unknown;
  expires_at: unknown;
  seats?: number;
  redeemed_by?: string | null;
  redeemed_email?: unknown;
  redeemed_name?: unknown;
  woo_order_id?: unknown;
  cancelled_at?: unknown;
};

function asIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

async function mintCode(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  const buf = randomBytes(10);
  let data = "";
  for (let i = 0; i < 10; i += 1) data += LICENSE_ALPHABET[buf[i]! % LICENSE_ALPHABET.length];
  const body = attachLicenseChecksum(data);
  return `IMAN-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}`;
}

async function clientIp(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const fwd = req?.headers.get("x-forwarded-for") ?? "";
    return fwd.split(",")[0]?.trim() || req?.headers.get("x-real-ip") || "local";
  } catch {
    return "local";
  }
}

async function guardAttempts(ip: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from iman_license_attempts where at < now() - interval '15 minutes'`;
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from iman_license_attempts
    where ip = ${ip} and at > now() - interval '15 minutes'
  `;
  if ((rows[0]?.n ?? 0) >= 20) throw new Error("Demasiados intentos. Esperá unos minutos.");
  await sql`insert into iman_license_attempts (ip) values (${ip})`;
}

async function secretsMatch(given: string, stored: string): Promise<boolean> {
  if (!given || !stored) return false;
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(stored).digest();
  return timingSafeEqual(a, b);
}

async function vendorRow() {
  const sql = await getSql();
  const rows = await sql<VendorRow>`
    select user_id, seller_name, sales_url, shop_secret from iman_vendor where id = 'vendor' limit 1
  `;
  return rows[0] ?? null;
}

function toAccess(opts: {
  userId: string;
  vendor: VendorRow | null;
  license: LicenseDb | null;
  email?: string;
  trial?: { started_at: unknown; expires_at: unknown } | null;
  extraSeats?: number;
}): MyAccess {
  const now = Date.now();
  const expiresAt = asIso(opts.license?.expires_at);
  const startsAt = asIso(opts.license?.starts_at);
  const cancelled = Boolean(asIso(opts.license?.cancelled_at));
  const active = Boolean(expiresAt && new Date(expiresAt).getTime() > now) && !cancelled;
  const trialExp = asIso(opts.trial?.expires_at);
  const trialStart = asIso(opts.trial?.started_at);
  const trialActive = Boolean(trialExp && new Date(trialExp).getTime() > now);
  const isVendor = isFounderEmail(opts.email) || opts.vendor?.user_id === opts.userId;
  const extraSeats = Math.max(0, opts.extraSeats ?? 0);
  const licenseSeats = clampSeats(Number(opts.license?.seats) || 1);
  const base = isVendor ? MAX_LOCALES : active ? licenseSeats : trialActive ? 1 : 0;
  const seatsAllowed = Math.min(MAX_LOCALES, isVendor ? MAX_LOCALES : base + extraSeats);
  return {
    isVendor,
    vendorClaimed: Boolean(opts.vendor),
    sellerName: opts.vendor?.seller_name || "IMAN",
    salesUrl: opts.vendor?.sales_url || "",
    hasShopSecret: Boolean(opts.vendor?.shop_secret),
    extraSeats,
    seatsAllowed,
    trial:
      trialStart && trialExp
        ? {
            startedAt: trialStart,
            expiresAt: trialExp,
            active: trialActive,
          }
        : null,
    license:
      opts.license && expiresAt && startsAt
        ? {
            code: opts.license.code,
            months: Number(opts.license.months),
            seats: licenseSeats,
            startsAt,
            expiresAt,
            active,
          }
        : null,
  };
}

async function trialRow(userId: string) {
  try {
    const sql = await getSql();
    const rows = await sql<{ started_at: unknown; expires_at: unknown }>`
      select started_at, expires_at from iman_trials where user_id = ${userId} limit 1
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function extraSeatsOf(userId: string): Promise<number> {
  try {
    const sql = await getSql();
    const owners = await sql<{ extra_seats: number }>`
      select coalesce(extra_seats, 0)::int as extra_seats
      from iman_owners
      where user_id = ${userId}
      limit 1
    `;
    if (owners[0]) return Math.max(0, Number(owners[0].extra_seats ?? 0));
    const rows = await sql<{ extra_seats: number }>`
      select coalesce(extra_seats, 0)::int as extra_seats
      from kiosk_account
      where user_id = ${userId}
      limit 1
    `;
    return Math.max(0, Number(rows[0]?.extra_seats ?? 0));
  } catch {
    return 0;
  }
}

async function ensureClientTrial(userId: string, email?: string): Promise<void> {
  const mail = email ?? (await emailOf(userId));
  if (isFounderEmail(mail)) return;
  const existing = await trialRow(userId);
  if (existing) return;
  const sql = await getSql();
  const users = await sql<{ createdAt: unknown }>`
    select "createdAt" from "user" where id = ${userId} limit 1
  `;
  const startIso = asIso(users[0]?.createdAt) ?? new Date().toISOString();
  const start = new Date(startIso);
  const expires = new Date(start.getTime() + TRIAL_DAYS * 86_400_000);
  await sql`
    insert into iman_trials (user_id, started_at, expires_at)
    values (${userId}, ${start.toISOString()}, ${expires.toISOString()})
    on conflict (user_id) do nothing
  `;
}

async function accessOf(userId: string, email?: string): Promise<MyAccess> {
  const vendor = await vendorRow();
  const license = await latestLicense(userId);
  const mail = email ?? (await emailOf(userId));
  await ensureClientTrial(userId, mail);
  const trial = await trialRow(userId);
  const extraSeats = await extraSeatsOf(userId);
  return toAccess({ userId, vendor, license, email: mail, trial, extraSeats });
}

/**
 * Las tres de abajo son de servidor y se exportan planas (no son server fn):
 * las llaman kiosk, crm y la ruta de Woo. Sin marcarlas, el cuerpo viaja al
 * navegador y arrastra la base entera: el bundle terminaba con `pg` adentro y
 * la app no levantaba en desarrollo. `createServerOnlyFn` las vacía del lado
 * del cliente y tira si alguien las llama desde ahí.
 */
export const assertEstudio = createServerOnlyFn(async (userId: string): Promise<void> => {
  const { ensureFounder } = await import("@/lib/founder");
  await ensureFounder();
  const email = await emailOf(userId);
  const vendor = await vendorRow();
  if (!isFounderEmail(email) && vendor?.user_id !== userId) {
    throw new Error("Solo el Estudio");
  }
});

export const localeCapFor = createServerOnlyFn(async (userId: string): Promise<number> => {
  const access = await accessOf(userId);
  return access.seatsAllowed;
});

async function latestLicense(userId: string): Promise<LicenseDb | null> {
  const sql = await getSql();
  try {
    const rows = await sql<LicenseDb>`
      select code, months, coalesce(seats, 1) as seats, created_at, redeemed_at, starts_at, expires_at, cancelled_at
      from iman_licenses
      where redeemed_by = ${userId}
      order by expires_at desc nulls last
      limit 1
    `;
    return rows[0] ?? null;
  } catch {
    const rows = await sql<LicenseDb>`
      select code, months, coalesce(seats, 1) as seats, created_at, redeemed_at, starts_at, expires_at
      from iman_licenses
      where redeemed_by = ${userId}
      order by expires_at desc nulls last
      limit 1
    `;
    return rows[0] ?? null;
  }
}

async function insertFreshCode(opts: {
  months: PlanMonths;
  createdBy: string;
  wooOrderId?: string;
  email?: string;
  seats?: number;
}): Promise<string> {
  const sql = await getSql();
  const seats = clampSeats(opts.seats ?? 1);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = await mintCode();
    try {
      await sql`
        insert into iman_licenses (code, months, seats, created_by, woo_order_id, issued_to_email)
        values (
          ${code},
          ${opts.months},
          ${seats},
          ${opts.createdBy},
          ${opts.wooOrderId || null},
          ${opts.email ?? ""}
        )
      `;
      return code;
    } catch {
      /* unique collision */
    }
  }
  throw new Error("No se pudo generar el código");
}

export const getVendorPublic = createServerFn({ method: "GET" }).handler(async (): Promise<VendorPublic> => {
  try {
    const vendor = await vendorRow();
    return {
      claimed: Boolean(vendor),
      sellerName: vendor?.seller_name || "IMAN",
      salesUrl: vendor?.sales_url || "",
    };
  } catch {
    return { claimed: false, sellerName: "IMAN", salesUrl: "" };
  }
});

export const peekLicense = createServerFn({ method: "POST" })
  .validator((data: { code: string }) => ({ code: String(data?.code ?? "") }))
  .handler(async ({ data }): Promise<LicensePeek> => {
    const ip = await clientIp();
    await guardAttempts(ip);
    const code = normalizeLicenseCode(data.code);
    if (!code) {
      return { ok: false, code: "", months: null, seats: null, used: false, error: "Ese código no es válido" };
    }
    const sql = await getSql();
    const rows = await sql<{ months: number; seats: number | null; redeemed_by: string | null }>`
      select months, coalesce(seats, 1) as seats, redeemed_by from iman_licenses where code = ${code} limit 1
    `;
    const row = rows[0];
    if (!row) {
      return { ok: false, code, months: null, seats: null, used: false, error: "Ese código no existe" };
    }
    if (row.redeemed_by) {
      return {
        ok: false,
        code,
        months: Number(row.months),
        seats: clampSeats(Number(row.seats) || 1),
        used: true,
        error: "Ese código ya se usó",
      };
    }
    return {
      ok: true,
      code,
      months: Number(row.months),
      seats: clampSeats(Number(row.seats) || 1),
      used: false,
      error: null,
    };
  });

async function emailOf(userId: string): Promise<string> {
  const sql = await getSql();
  const rows = await sql<{ email: string }>`
    select email from "user" where id = ${userId} limit 1
  `;
  return rows[0]?.email ?? "";
}

export const seedStudio = createServerFn({ method: "POST" }).handler(async () => {
  const { ensureFounder, estudioPasswordConfigured } = await import("@/lib/founder");
  const id = await ensureFounder();
  return { ok: Boolean(id), email: FOUNDER_EMAIL, configured: estudioPasswordConfigured() };
});

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MyAccess> => {
    const { ensureFounder } = await import("@/lib/founder");
    await ensureFounder();
    const mail = await emailOf(context.userId);
    if (!isFounderEmail(mail)) {
      const { claimOwnerRow } = await import("@/lib/owners");
      await claimOwnerRow(context.userId);
    }
    return accessOf(context.userId, mail);
  });

export const startTrial = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MyAccess> => {
    const current = await accessOf(context.userId);
    if (current.license?.active) return current;
    if (current.trial) {
      if (current.trial.active) return current;
      throw new Error("La prueba de 19 días ya se usó. Activá con tu código.");
    }
    await ensureClientTrial(context.userId);
    return accessOf(context.userId);
  });

export const setLicenseStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { code: string; action: "cancel" | "reactivate" }) => {
    const code = String(data?.code ?? "").trim();
    const action = data?.action;
    if (!code) throw new Error("Falta el código");
    if (action !== "cancel" && action !== "reactivate") throw new Error("Acción inválida");
    return { code, action };
  })
  .handler(async ({ context, data }): Promise<{ ok: boolean }> => {
    const vendor = await vendorRow();
    if (!vendor || vendor.user_id !== context.userId) throw new Error("No sos el vendedor");
    const sql = await getSql();
    if (data.action === "cancel") {
      await sql`update iman_licenses set cancelled_at = now() where code = ${data.code}`;
    } else {
      await sql`update iman_licenses set cancelled_at = null where code = ${data.code}`;
    }
    return { ok: true };
  });

export const updateVendor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { sellerName: string; salesUrl: string }) => {
    const sellerName = (data?.sellerName ?? "").trim().slice(0, 80);
    const salesUrl = (data?.salesUrl ?? "").trim();
    if (salesUrl && !/^https?:\/\/.+/i.test(salesUrl)) {
      throw new Error("La tienda tiene que ser un enlace http o https");
    }
    return { sellerName: sellerName || "IMAN", salesUrl };
  })
  .handler(async ({ context, data }): Promise<VendorPublic> => {
    const vendor = await vendorRow();
    if (!vendor || vendor.user_id !== context.userId) throw new Error("No sos el vendedor");
    const sql = await getSql();
    await sql`
      update iman_vendor
      set seller_name = ${data.sellerName}, sales_url = ${data.salesUrl}
      where id = 'vendor' and user_id = ${context.userId}
    `;
    return { claimed: true, sellerName: data.sellerName, salesUrl: data.salesUrl };
  });

export const rotateShopSecret = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ secret: string }> => {
    const vendor = await vendorRow();
    if (!vendor || vendor.user_id !== context.userId) throw new Error("No sos el vendedor");
    const { randomBytes } = await import("node:crypto");
    const secret = randomBytes(24).toString("base64url");
    const sql = await getSql();
    await sql`
      update iman_vendor set shop_secret = ${secret}
      where id = 'vendor' and user_id = ${context.userId}
    `;
    return { secret };
  });

export const testMint = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { months: number; seats?: number; email?: string }) => {
    const months = Number(data?.months);
    const seats = clampSeats(Number(data?.seats ?? 1));
    if (!isPlanMonths(months)) throw new Error("Período inválido");
    if (!isPlanSeats(seats)) throw new Error("Locales inválidos");
    return { months, seats, email: (data?.email ?? "").trim() };
  })
  .handler(async ({ context, data }): Promise<{ code: string; months: number; seats: number; activate_path: string }> => {
    const vendor = await vendorRow();
    if (!vendor || vendor.user_id !== context.userId) throw new Error("No sos el vendedor");
    const orderId = `test-${Date.now()}`;
    const code = await insertFreshCode({
      months: data.months,
      seats: data.seats,
      createdBy: context.userId,
      wooOrderId: orderId,
      email: data.email,
    });
    return {
      code,
      months: data.months,
      seats: data.seats,
      activate_path: `/activar?codigo=${encodeURIComponent(code)}`,
    };
  });

export const issueLicenses = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { months: number; seats?: number; quantity: number }) => {
    const months = Number(data?.months);
    const seats = clampSeats(Number(data?.seats ?? 1));
    const quantity = Math.min(25, Math.max(1, Math.round(Number(data?.quantity) || 1)));
    if (!isPlanMonths(months)) throw new Error("Período inválido");
    if (!isPlanSeats(seats)) throw new Error("Locales inválidos");
    return { months, seats, quantity };
  })
  .handler(async ({ context, data }): Promise<{ codes: string[] }> => {
    const vendor = await vendorRow();
    if (!vendor || vendor.user_id !== context.userId) throw new Error("No sos el vendedor");
    const codes: string[] = [];
    for (let n = 0; n < data.quantity; n += 1) {
      codes.push(
        await insertFreshCode({ months: data.months, seats: data.seats, createdBy: context.userId }),
      );
    }
    return { codes };
  });

export const listLicenses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LicenseRow[]> => {
    const vendor = await vendorRow();
    if (!vendor || vendor.user_id !== context.userId) throw new Error("No sos el vendedor");
    const sql = await getSql();
    const rows = await sql<LicenseDb>`
      select
        l.code,
        l.months,
        coalesce(l.seats, 1) as seats,
        l.created_at,
        l.redeemed_at,
        l.starts_at,
        l.expires_at,
        l.woo_order_id,
        l.cancelled_at,
        u.email as redeemed_email,
        u.name as redeemed_name
      from iman_licenses l
      left join "user" u on u.id = l.redeemed_by
      order by l.created_at desc
      limit 120
    `;
    return rows.map((r) => ({
      code: r.code,
      months: Number(r.months),
      seats: clampSeats(Number(r.seats) || 1),
      createdAt: asIso(r.created_at) ?? "",
      redeemedAt: asIso(r.redeemed_at),
      startsAt: asIso(r.starts_at),
      expiresAt: asIso(r.expires_at),
      redeemedEmail: r.redeemed_email ? String(r.redeemed_email) : null,
      redeemedName: r.redeemed_name ? String(r.redeemed_name) : null,
      wooOrderId: r.woo_order_id ? String(r.woo_order_id) : null,
      cancelledAt: asIso(r.cancelled_at),
    }));
  });

export const redeemLicense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { code: string }) => {
    const code = normalizeLicenseCode(data?.code ?? "");
    if (!code) throw new Error("Código inválido");
    return { code };
  })
  .handler(async ({ context, data }): Promise<MyAccess> => {
    const ip = await clientIp();
    await guardAttempts(ip);
    const sql = await getSql();
    const rows = await sql<LicenseDb & { redeemed_by: string | null; months: number }>`
      select code, months, coalesce(seats, 1) as seats, created_at, redeemed_at, starts_at, expires_at, redeemed_by, cancelled_at
      from iman_licenses
      where code = ${data.code}
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Ese código no existe");
    if (row.redeemed_by && row.redeemed_by !== context.userId) {
      throw new Error("Ese código ya se usó en otra cuenta");
    }
    if (row.redeemed_by === context.userId && row.expires_at) {
      return accessOf(context.userId);
    }

    const months = Number(row.months) as PlanMonths;
    if (!isPlanMonths(months)) throw new Error("Período inválido");

    const current = await latestLicense(context.userId);
    const now = new Date();
    const currentExp = asIso(current?.expires_at);
    const currentActive =
      Boolean(currentExp && new Date(currentExp).getTime() > now.getTime()) && !asIso(current?.cancelled_at);
    const start = currentActive && currentExp ? new Date(currentExp) : now;
    const expires = addMonths(start, months);
    const newSeats = clampSeats(Number(row.seats) || 1);
    const seats = Math.max(Number(current?.seats) || 0, newSeats, 1);

    const updated = await sql<{ code: string }>`
      update iman_licenses
      set
        redeemed_by = ${context.userId},
        redeemed_at = now(),
        starts_at = ${start.toISOString()},
        expires_at = ${expires.toISOString()},
        seats = ${seats},
        cancelled_at = null
      where code = ${data.code}
        and redeemed_by is null
      returning code
    `;
    if (!updated[0]) {
      const again = await sql<{ redeemed_by: string | null }>`
        select redeemed_by from iman_licenses where code = ${data.code} limit 1
      `;
      if (again[0]?.redeemed_by !== context.userId) {
        throw new Error("Ese código ya se usó en otra cuenta");
      }
    }

    return accessOf(context.userId);
  });

export type WooIssueResult =
  | { ok: true; code: string; months: number; seats?: number; activate_path: string; email: string }
  | { ok: false; error: string; status: number };

function skuFromWooPayload(body: Record<string, unknown>): string {
  const sku = String(body.sku ?? "").trim();
  if (sku) return sku;
  const items = Array.isArray(body.line_items) ? body.line_items : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const found = String(rec.sku ?? "").trim() || String(rec.name ?? "").trim();
    if (found) return found;
  }
  return "";
}

function monthsFromWooPayload(body: Record<string, unknown>): PlanMonths | null {
  const sku = skuFromWooPayload(body);
  const fromSku = monthsFromSku(sku);
  if (fromSku) return fromSku;
  if (isPlanMonths(Number(body.months))) return Number(body.months) as PlanMonths;
  return null;
}

export const fulfillWooLicense = createServerOnlyFn(async (opts: {
  rawBody: string;
  bearer: string | null;
  signature: string | null;
}): Promise<WooIssueResult> => {
  const vendor = await vendorRow();
  if (!vendor?.shop_secret) {
    return { ok: false, error: "La tienda no tiene clave de IMAN", status: 503 };
  }
  let authorized = await secretsMatch(opts.bearer ?? "", vendor.shop_secret);
  if (!authorized && opts.signature) {
    const { createHmac, timingSafeEqual } = await import("node:crypto");
    const digest = createHmac("sha256", vendor.shop_secret).update(opts.rawBody).digest("base64");
    try {
      const a = Buffer.from(digest);
      const b = Buffer.from(opts.signature);
      authorized = a.length === b.length && timingSafeEqual(a, b);
    } catch {
      authorized = false;
    }
  }
  if (!authorized) return { ok: false, error: "Clave inválida", status: 401 };

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(opts.rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "JSON inválido", status: 400 };
  }

  const orderId = String(body.id ?? body.order_id ?? "").trim();
  const email = String(
    body.email ??
      (body.billing && typeof body.billing === "object"
        ? (body.billing as { email?: string }).email
        : "") ??
      "",
  ).trim();
  const months = monthsFromWooPayload(body);
  if (!months) {
    return {
      ok: false,
      error: "El pedido no tiene un pack IMAN. SKU: iman-12-1l … iman-36-5l.",
      status: 422,
    };
  }

  const sql = await getSql();
  if (orderId) {
    const existing = await sql<{ code: string; months: number; seats: number }>`
      select code, months, coalesce(seats, 1) as seats from iman_licenses where woo_order_id = ${orderId} limit 1
    `;
    if (existing[0]) {
      return {
        ok: true,
        code: existing[0].code,
        months: Number(existing[0].months),
        seats: clampSeats(Number(existing[0].seats) || 1),
        activate_path: `/activar?codigo=${encodeURIComponent(existing[0].code)}`,
        email,
      };
    }
  }

  const sku = skuFromWooPayload(body);
  const seats = seatsForPlan(months, sku);
  const code = await insertFreshCode({
    months,
    seats,
    createdBy: vendor.user_id,
    wooOrderId: orderId,
    email,
  });
  return {
    ok: true,
    code,
    months,
    seats,
    activate_path: `/activar?codigo=${encodeURIComponent(code)}`,
    email,
  };
});

/**
 * Acá vivía `purgeForgottenAccounts`: borraba TODAS las cuentas menos la que
 * la llamaba (`select id from "user" where id <> …` y un delete por cada una).
 * Se había pedido para limpiar cuentas de prueba con la contraseña olvidada,
 * pero con un kiosquero de verdad en la base se lo llevaba puesto. No se
 * repone: si hace falta dar de baja una cuenta, va una baja **por cuenta**,
 * con su id, en el CRM del Estudio.
 */

