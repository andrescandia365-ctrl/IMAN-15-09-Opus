import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db.server";
import type { PayMethod, TicketLine } from "@/lib/types";

export type DeskTicket = {
  id: string;
  storeId: string;
  at: string;
  lines: TicketLine[];
  total: number;
  payMethod?: PayMethod;
  paid?: number | null;
};

function asTicket(raw: unknown): DeskTicket | null {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.storeId !== "string") return null;
  if (!Array.isArray(v.lines)) return null;
  const lines = v.lines
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const l = row as Record<string, unknown>;
      const productId = String(l.productId ?? "");
      const name = String(l.name ?? "");
      const qty = Number(l.qty);
      const price = Number(l.price);
      if (!productId || !name || !Number.isFinite(qty) || qty <= 0) return null;
      return {
        productId,
        name,
        barcode: String(l.barcode ?? ""),
        price: Number.isFinite(price) ? price : 0,
        qty,
      } satisfies TicketLine;
    })
    .filter((l): l is TicketLine => Boolean(l));
  if (!lines.length) return null;
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const pay = v.payMethod;
  const payMethod: PayMethod | undefined =
    pay === "efectivo" || pay === "mercadopago" || pay === "debito" ? pay : undefined;
  // Sin dato es null, no 0: Number(null) da 0 y la PC abría el cobro en
  // efectivo con "Recibir: 0", que el encargado tenía que borrar cada vez.
  const paidN = v.paid == null || v.paid === "" ? Number.NaN : Number(v.paid);
  return {
    id: v.id,
    storeId: v.storeId,
    at: String(v.at ?? new Date().toISOString()),
    lines,
    total,
    payMethod,
    paid: Number.isFinite(paidN) ? paidN : null,
  };
}

export const sendDeskTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { storeId: string; lines: TicketLine[]; payMethod?: PayMethod; paid?: number | null }) => {
    if (!data?.storeId) throw new Error("Falta el local");
    if (!Array.isArray(data.lines) || !data.lines.length) throw new Error("El ticket está vacío");
    const lines = data.lines.slice(0, 80).map((l) => ({
      productId: String(l.productId),
      name: String(l.name).slice(0, 80),
      barcode: String(l.barcode ?? "").slice(0, 32),
      price: Number(l.price) || 0,
      qty: Math.max(1, Math.min(999, Number(l.qty) || 1)),
    }));
    const pay = data.payMethod;
    const payMethod: PayMethod | undefined =
      pay === "efectivo" || pay === "mercadopago" || pay === "debito" ? pay : undefined;
    return { storeId: data.storeId, lines, payMethod, paid: data.paid ?? null };
  })
  .handler(async ({ context, data }): Promise<{ ok: true; ticket: DeskTicket }> => {
    const total = data.lines.reduce((s, l) => s + l.price * l.qty, 0);
    const ticket: DeskTicket = {
      id: `tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      storeId: data.storeId,
      at: new Date().toISOString(),
      lines: data.lines,
      total,
      payMethod: data.payMethod,
      paid: data.paid,
    };
    const sql = await getSql();
    const body = JSON.stringify(ticket);
    await sql`
      insert into kiosk_desk_ticket (user_id, store_id, ticket_id, payload)
      values (${context.userId}, ${data.storeId}, ${ticket.id}, CAST(${body} AS jsonb))
    `;
    const { publishDeskTicket } = await import("@/lib/desk-bus");
    publishDeskTicket(context.userId, data.storeId, ticket);
    return { ok: true, ticket };
  });

export const listDeskInbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((data: { storeId: string }) => {
    if (!data?.storeId) throw new Error("Falta el local");
    return { storeId: data.storeId };
  })
  .handler(async ({ context, data }): Promise<{ tickets: DeskTicket[] }> => {
    const sql = await getSql();
    await sql`
      delete from kiosk_desk_ticket
      where user_id = ${context.userId}
        and taken_at is null
        and created_at < now() - interval '24 hours'
    `;
    const rows = await sql<{ payload: unknown }>`
      select payload from kiosk_desk_ticket
      where user_id = ${context.userId}
        and store_id = ${data.storeId}
        and taken_at is null
        and created_at > now() - interval '24 hours'
      order by created_at desc
      limit 8
    `;
    const tickets = rows.map((r) => asTicket(r.payload)).filter((t): t is DeskTicket => Boolean(t));
    return { tickets };
  });

export const takeDeskTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { storeId: string; ticketId: string }) => {
    if (!data?.storeId || !data?.ticketId) throw new Error("Falta el ticket");
    return { storeId: data.storeId, ticketId: data.ticketId };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      update kiosk_desk_ticket
      set taken_at = now()
      where user_id = ${context.userId}
        and store_id = ${data.storeId}
        and ticket_id = ${data.ticketId}
        and taken_at is null
    `;
    return { ok: true };
  });

/** De servidor: la usa la ruta del buzón. Marcada para que no cruce al navegador. */
export const pendingDeskTickets = createServerOnlyFn(async (userId: string, storeId: string): Promise<DeskTicket[]> => {
  const sql = await getSql();
  const rows = await sql<{ payload: unknown }>`
    select payload from kiosk_desk_ticket
    where user_id = ${userId}
      and store_id = ${storeId}
      and taken_at is null
      and created_at > now() - interval '24 hours'
    order by created_at desc
    limit 8
  `;
  return rows.map((r) => asTicket(r.payload)).filter((t): t is DeskTicket => Boolean(t));
});
