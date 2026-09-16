import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addCreatorNote,
  deleteCreatorNote,
  listCreatorNotes,
  NOTE_TAGS,
  type CreatorNote,
  type NoteTag,
} from "@/lib/creator-notes";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorText } from "@/lib/errors";

export function CreatorNotes() {
  const [notes, setNotes] = useState<CreatorNote[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<NoteTag>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void listCreatorNotes()
      .then((r) => {
        if (live) setNotes(r.notes);
      })
      .catch(() => {
        if (live) setNotes([]);
      });
    return () => {
      live = false;
    };
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { note } = await addCreatorNote({ data: { title, body, tag } });
      setNotes((cur) => [note, ...(cur ?? [])]);
      setTitle("");
      setBody("");
      setTag("");
      toast.success("Nota guardada");
    } catch (err) {
      toast.error(errorText(err, "No se pudo guardar"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteCreatorNote({ data: { id } });
      setNotes((cur) => (cur ?? []).filter((n) => n.id !== id));
    } catch (err) {
      toast.error(errorText(err, "No se pudo borrar"));
    }
  }

  return (
    <section id="iman-notas" className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
      <p className="text-[11px] uppercase tracking-[0.14em] text-sage">Solo vos</p>
      <h2 className="mt-1 font-display text-xl tracking-tight">Notas del creador</h2>
      <p className="mt-1 text-sm text-muted">No sale en IMAN del kiosco.</p>

      <form onSubmit={(e) => void save(e)} className="mt-4 space-y-3">
        <div>
          <Label htmlFor="note-title">Título</Label>
          <Input
            id="note-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Precio del pack, primer venta, bug…"
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="note-body">Nota</Label>
          <textarea
            id="note-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            rows={5}
            className="mt-1.5 min-h-28 w-full rounded-md bg-elevated p-3 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-subtle focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--iman-accent)]"
            placeholder="Lo que no querés perder."
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTag("")}
            className={cn(
              "h-8 rounded-full px-3 text-xs font-medium",
              !tag ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
            )}
          >
            Sin tag
          </button>
          {NOTE_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              className={cn(
                "h-8 rounded-full px-3 text-xs font-medium",
                tag === t ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar nota"}
        </Button>
      </form>

      <ul className="mt-5 space-y-3">
        {notes === null ? <li className="text-sm text-muted">Cargando notas…</li> : null}
        {notes?.length === 0 ? (
          <li className="text-sm text-muted">Todavía no hay notas.</li>
        ) : null}
        {notes?.map((n) => (
          <li key={n.id} className="rounded-lg bg-elevated px-4 py-3 shadow-[var(--shadow-border)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{n.title}</p>
                <p className="mt-0.5 text-[11px] text-subtle">
                  {formatDateTime(n.createdAt)}
                  {n.tag ? ` · ${n.tag}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-muted hover:text-danger"
                onClick={() => void remove(n.id)}
              >
                Borrar
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{n.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
