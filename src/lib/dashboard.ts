import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { dbSource, getSql } from "@/lib/db.server";

export type DashboardAccount = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  hasLocal: boolean;
  planActive: boolean;
  planExpiresAt: string | null;
  fromWoo: boolean;
};

export type NextStep = {
  id: string;
  title: string;
  detail: string;
  status: "done" | "now" | "later";
};

export type VendorDashboard = {
  hosting: "preview" | "published";
  accountCount: number;
  locals: number;
  sessions: number;
  plansActive: number;
  plansExpired: number;
  codesIssued: number;
  codesUnused: number;
  wooOrders: number;
  wooTestOrders: number;
  kioskBytes: number;
  eventCount: number;
  eventBytes: number;
  avgKioskBytes: number;
  hasShopSecret: boolean;
  salesUrl: string;
  sellerName: string;
  comfortable: number;
  ceiling: number;
  target: number;
  recent: DashboardAccount[];
  steps: NextStep[];
  briefing: string;
  resets: { id: string; recipient: string; url: string; createdAt: string; sent: boolean }[];
};

function asIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function n(rows: { n: number | string }[]): number {
  return Number(rows[0]?.n ?? 0);
}

export const getVendorDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<VendorDashboard> => {
    const { ensureFounder } = await import("@/lib/founder");
    await ensureFounder();
    const sql = await getSql();
    const vendor = await sql<{
      user_id: string;
      seller_name: string;
      sales_url: string;
      shop_secret: string;
    }>`
      select user_id, seller_name, sales_url, shop_secret
      from iman_vendor where id = 'vendor' limit 1
    `;
    const me = vendor[0];
    if (!me || me.user_id !== context.userId) {
      throw new Error("El taller es solo para el vendedor");
    }

    const hosting = dbSource === "neon" ? "published" : "preview";
    const comfortable = hosting === "published" ? 600 : 40;
    const ceiling = hosting === "published" ? 1000 : 80;
    const target = 1;

    const accountCount = n(await sql<{ n: number }>`select count(*)::int as n from "user"`);
    const locals = n(await sql<{ n: number }>`select count(*)::int as n from kiosk_store`);
    const sessions = n(
      await sql<{ n: number }>`select count(*)::int as n from "session" where "expiresAt" > now()`,
    );
    const plansActive = n(
      await sql<{ n: number }>`
        select count(*)::int as n from iman_licenses
        where redeemed_by is not null and expires_at > now()
      `,
    );
    const plansExpired = n(
      await sql<{ n: number }>`
        select count(*)::int as n from iman_licenses
        where redeemed_by is not null and expires_at <= now()
      `,
    );
    const codesIssued = n(await sql<{ n: number }>`select count(*)::int as n from iman_licenses`);
    const codesUnused = n(
      await sql<{ n: number }>`
        select count(*)::int as n from iman_licenses where redeemed_by is null
      `,
    );
    const wooOrders = n(
      await sql<{ n: number }>`
        select count(*)::int as n from iman_licenses
        where woo_order_id is not null and woo_order_id <> ''
          and woo_order_id not like 'test-%'
      `,
    );
    const wooTestOrders = n(
      await sql<{ n: number }>`
        select count(*)::int as n from iman_licenses
        where woo_order_id like 'test-%'
      `,
    );
    const kioskBytes = n(
      await sql<{ n: number }>`
        select coalesce(sum(octet_length(payload::text)), 0)::int as n from kiosk_store
      `,
    );
    let eventCount = 0;
    let eventBytes = 0;
    try {
      eventCount = n(await sql<{ n: number }>`select count(*)::int as n from kiosk_event`);
      eventBytes = n(
        await sql<{ n: number }>`
          select coalesce(sum(octet_length(body::text)), 0)::int as n from kiosk_event
        `,
      );
    } catch {
      eventCount = 0;
      eventBytes = 0;
    }
    const avgKioskBytes = locals > 0 ? Math.round(kioskBytes / locals) : 0;

    const recentRows = await sql<{
      id: string;
      name: string;
      email: string;
      createdAt: unknown;
    }>`
      select u.id, u.name, u.email, u."createdAt" as "createdAt"
      from "user" u
      order by u."createdAt" desc
      limit 25
    `;

    const localRows = await sql<{ user_id: string }>`select distinct user_id from kiosk_store`;
    const localSet = new Set(localRows.map((r) => r.user_id));
    const planRows = await sql<{
      redeemed_by: string;
      expires_at: unknown;
      woo_order_id: string | null;
    }>`
      select distinct on (redeemed_by) redeemed_by, expires_at, woo_order_id
      from iman_licenses
      where redeemed_by is not null
      order by redeemed_by, expires_at desc nulls last
    `;
    const planByUser = new Map<string, { expires_at: unknown; woo_order_id: string | null }>();
    for (const row of planRows) {
      if (!planByUser.has(row.redeemed_by)) planByUser.set(row.redeemed_by, row);
    }

    const recent: DashboardAccount[] = recentRows.map((r) => {
      const plan = planByUser.get(r.id);
      const planExpiresAt = asIso(plan?.expires_at);
      const woo = plan?.woo_order_id ?? "";
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        createdAt: asIso(r.createdAt) ?? "",
        hasLocal: localSet.has(r.id),
        planActive: Boolean(planExpiresAt && new Date(planExpiresAt).getTime() > Date.now()),
        planExpiresAt,
        fromWoo: Boolean(woo && !woo.startsWith("test-")),
      };
    });

    const hasShopSecret = Boolean(me.shop_secret);
    const salesUrl = me.sales_url || "";
    const path2Live = wooOrders > 0;

    const raw: Array<Omit<NextStep, "status"> & { done: boolean }> = [
      {
        id: "claim",
        title: "Estudio IMAN",
        detail: `Solo /estudio · mail + clave. El cliente no lo ve en la landing.`,
        done: true,
      },
      {
        id: "publish",
        title: "Publicar IMAN (base real)",
        detail:
          hosting === "published"
            ? "Base real. Las cuentas de dueño quedan."
            : "El preview se borra. Publicá para vender de verdad: las cuentas viven en Neon ($0 alcanza para salir).",
        done: hosting === "published",
      },
      {
        id: "secret",
        title: "Clave de tienda",
        detail: hasShopSecret
          ? "Hay clave. Si la perdiste, rotá en Ajustes y actualizá el snippet."
          : "Creala en Ajustes. Sin ella WooCommerce no puede mintir códigos.",
        done: hasShopSecret,
      },
      {
        id: "shop",
        title: "URL de WooCommerce",
        detail: salesUrl
          ? `Tienda: ${salesUrl}`
          : "Guardá el enlace de la tienda en Ajustes para que el dueño sepa dónde comprar.",
        done: Boolean(salesUrl),
      },
      {
        id: "sku",
        title: "SKU iman-12-1l … iman-36-5l",
        detail:
          "Quince variaciones: 1, 2 o 3 años × 1 a 5 locales. Ej. iman-24-3l = 2 años, 3 locales.",
        done: path2Live,
      },
      {
        id: "snippet",
        title: "Pegar el snippet Path 2",
        detail: path2Live
          ? "WooCommerce ya mintió al menos un pedido real."
          : "Todavía no implementaste Path 2. Code Snippets + pedido de prueba a tu mail.",
        done: path2Live,
      },
      {
        id: "sell",
        title: "Vender el primer pack",
        detail:
          plansActive > 0
            ? `${plansActive} plan${plansActive === 1 ? "" : "es"} cobrado${plansActive === 1 ? "" : "s"}. Eso es IMAN andando.`
            : "Esta es la meta. El dueño paga, recibe el código, abre el mostrador. El resto es después.",
        done: wooOrders > 0 && plansActive > 0,
      },
    ];

    let sawNow = false;
    const steps: NextStep[] = raw.map((s) => {
      if (s.done) return { id: s.id, title: s.title, detail: s.detail, status: "done" as const };
      if (!sawNow) {
        sawNow = true;
        return { id: s.id, title: s.title, detail: s.detail, status: "now" as const };
      }
      return { id: s.id, title: s.title, detail: s.detail, status: "later" as const };
    });

    let resets: VendorDashboard["resets"] = [];
    try {
      const rows = await sql<{
        id: string;
        recipient: string;
        url: string | null;
        created_at: unknown;
        sent_at: unknown;
      }>`
        select id, recipient, url, created_at, sent_at
        from iman_outbox
        where kind = 'reset'
        order by created_at desc
        limit 15
      `;
      resets = rows.map((r) => ({
        id: r.id,
        recipient: r.recipient,
        url: r.url ?? "",
        createdAt: asIso(r.created_at) ?? "",
        sent: Boolean(r.sent_at),
      }));
    } catch {
      resets = [];
    }
    const nowStep = steps.find((s) => s.status === "now");
    let briefing: string;
    if (hosting === "preview") {
      briefing =
        `Preview: ${accountCount} cuenta${accountCount === 1 ? "" : "s"}. Acá se prueba, no se cobra. ` +
        `La meta es vender el primer pack. Publicá, reclamá allá, Woo con Path 2. ` +
        (nowStep ? `Ahora: ${nowStep.title}.` : "");
    } else if (plansActive === 0) {
      briefing =
        `Publicado. Todavía no hay un plan cobrado. Neon $0 aguanta los primeros cientos. ` +
        `Hasta que Path 2 minta un pedido, cada venta es a mano. ` +
        (nowStep ? `Ahora: ${nowStep.title}.` : "");
    } else {
      briefing =
        `${plansActive} pack${plansActive === 1 ? "" : "s"} cobrado${plansActive === 1 ? "" : "s"}, ` +
        `${wooOrders} pedido${wooOrders === 1 ? "" : "s"} Woo. Eso es la meta. ` +
        `Cuentas ${accountCount}. Neon $0 ~${comfortable} locales cómodos.`;
    }

    return {
      hosting,
      accountCount,
      locals,
      sessions,
      plansActive,
      plansExpired,
      codesIssued,
      codesUnused,
      wooOrders,
      wooTestOrders,
      kioskBytes,
      eventCount,
      eventBytes,
      avgKioskBytes,
      hasShopSecret,
      salesUrl,
      sellerName: me.seller_name,
      comfortable,
      ceiling,
      target,
      recent,
      steps,
      briefing,
      resets,
    };
  });
