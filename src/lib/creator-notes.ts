import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

export const NOTE_TAGS = ["precio", "pack", "bug", "decisión", "venta"] as const;
export type NoteTag = (typeof NOTE_TAGS)[number] | "";

export type CreatorNote = {
  id: string;
  title: string;
  body: string;
  tag: NoteTag;
  createdAt: string;
};

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value ?? ""));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function asTag(raw: unknown): NoteTag {
  const t = String(raw ?? "").trim();
  return (NOTE_TAGS as readonly string[]).includes(t) ? (t as NoteTag) : "";
}

async function requireStudio(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    select user_id from iman_vendor where id = 'vendor' limit 1
  `;
  if (!rows[0] || rows[0].user_id !== userId) throw new Error("Solo el Estudio");
  await sql.query(`
    create table if not exists creator_note (
      id text primary key,
      user_id text not null,
      title text not null,
      body text not null,
      tag text not null default '',
      created_at timestamptz not null default now()
    )
  `);
  await sql
    .query(
      `create index if not exists creator_note_created_idx on creator_note (user_id, created_at desc)`,
    )
    .catch(() => undefined);
  return sql;
}

export const listCreatorNotes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ notes: CreatorNote[] }> => {
    const sql = await requireStudio(context.userId);
    const rows = await sql<{
      id: string;
      title: string;
      body: string;
      tag: string;
      created_at: unknown;
    }>`
      select id, title, body, tag, created_at
      from creator_note
      where user_id = ${context.userId}
      order by created_at desc
      limit 80
    `;
    return {
      notes: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        tag: asTag(r.tag),
        createdAt: asIso(r.created_at),
      })),
    };
  });

export const addCreatorNote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { title: string; body: string; tag?: string }) => {
    const title = String(data?.title ?? "").trim().slice(0, 80);
    const body = String(data?.body ?? "").trim().slice(0, 4000);
    if (!title) throw new Error("Falta el título");
    if (!body) throw new Error("Escribí la nota");
    return { title, body, tag: asTag(data?.tag) };
  })
  .handler(async ({ context, data }): Promise<{ note: CreatorNote }> => {
    const sql = await requireStudio(context.userId);
    const note: CreatorNote = {
      id: `nt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title: data.title,
      body: data.body,
      tag: data.tag,
      createdAt: new Date().toISOString(),
    };
    await sql`
      insert into creator_note (id, user_id, title, body, tag, created_at)
      values (
        ${note.id},
        ${context.userId},
        ${note.title},
        ${note.body},
        ${note.tag},
        ${note.createdAt}::timestamptz
      )
    `;
    return { note };
  });

export const deleteCreatorNote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id: string }) => {
    const id = String(data?.id ?? "").trim();
    if (!id) throw new Error("Falta la nota");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await requireStudio(context.userId);
    await sql`
      delete from creator_note
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true };
  });
