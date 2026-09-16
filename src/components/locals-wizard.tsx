import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AR_CITIES } from "@/lib/cities";
import { registerLocals, type AccountBundle, type StoreMeta } from "@/lib/kiosk";
import { errorText } from "@/lib/errors";

type Row = { name: string; city: string };

export function LocalsWizard({
  seats,
  existing,
  onDone,
  onSkip,
}: {
  seats: number;
  existing: StoreMeta[];
  onDone: (bundle: AccountBundle) => void;
  onSkip?: () => void;
}) {
  const need = Math.max(0, seats - existing.length);
  const blanks = useMemo<Row[]>(
    () => Array.from({ length: Math.max(1, need) }, () => ({ name: "", city: "" })),
    [need],
  );
  const [rows, setRows] = useState<Row[]>(blanks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(i: number, key: keyof Row, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const locals = rows
      .map((r) => ({ name: r.name.trim(), alias: "", city: r.city.trim() }))
      .filter((r) => r.name);
    if (!locals.length) {
      setError("Poné al menos el nombre de un local");
      return;
    }
    setBusy(true);
    try {
      const bundle = await registerLocals({ data: { locals } });
      toast.success(locals.length === 1 ? "Local listo" : `${locals.length} locales listos`);
      onDone(bundle);
    } catch (err) {
      setError(errorText(err, "No se pudieron registrar"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-fg">
      <form onSubmit={(e) => void onSubmit(e)} className="w-full max-w-md">
        <div className="ticket-grain rounded-2xl bg-paper p-6 text-ink shadow-[var(--shadow-ticket)]">
          <p className="text-center text-[11px] uppercase tracking-[0.18em] text-ink-muted">Dueño</p>
          <h1 className="mt-2 text-center font-display text-3xl tracking-tight">
            {seats === 1 ? "Tu local" : `${seats} locales en el plan`}
          </h1>
          <p className="mt-3 text-center text-sm text-ink-muted">
            Nombre del local y ciudad. Eso va en el ticket.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {existing.map((s) => (
            <div key={s.id} className="rounded-lg bg-surface px-3 py-2.5 text-sm shadow-[var(--shadow-border)]">
              <span className="text-muted">Ya está · </span>
              {s.name}
            </div>
          ))}
          {rows.map((row, i) => (
            <div key={i} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
              <p className="text-[11px] uppercase tracking-[0.12em] text-subtle">
                Local {existing.length + i + 1}
              </p>
              <div className="mt-2">
                <Label htmlFor={`loc-name-${i}`}>Nombre</Label>
                <Input
                  id={`loc-name-${i}`}
                  value={row.name}
                  onChange={(e) => patch(i, "name", e.target.value)}
                  placeholder="Kiosco San Martín"
                  maxLength={40}
                  autoFocus={i === 0}
                />
              </div>
              <div className="mt-3">
                <Label htmlFor={`loc-city-${i}`}>Ciudad</Label>
                <Input
                  id={`loc-city-${i}`}
                  list="iman-cities"
                  value={row.city}
                  onChange={(e) => patch(i, "city", e.target.value)}
                  placeholder="Córdoba"
                  maxLength={40}
                />
              </div>
            </div>
          ))}
          <datalist id="iman-cities">
            {AR_CITIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <Button type="submit" className="mt-5 w-full" size="lg" disabled={busy}>
          {busy ? "Guardando…" : "Registrar"}
        </Button>
        {existing.length > 0 && onSkip ? (
          <button
            type="button"
            className="mt-3 w-full text-center text-sm text-muted hover:text-fg"
            onClick={onSkip}
          >
            Entrar con los que ya están
          </button>
        ) : null}
      </form>
    </main>
  );
}
