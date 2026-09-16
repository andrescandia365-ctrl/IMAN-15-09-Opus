import { useState } from "react";
import { MANUALS, type ManualId } from "@/lib/manuals";
import { printSlip } from "@/lib/print";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ManualsView({ only }: { only?: ManualId[] }) {
  const list = only ? MANUALS.filter((m) => only.includes(m.id)) : MANUALS;
  const [open, setOpen] = useState<ManualId>(list[0]?.id ?? "seller");
  const current = MANUALS.find((m) => m.id === open) ?? list[0]!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {list.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpen(m.id)}
            className={cn(
              "h-9 rounded-full px-3 text-sm",
              open === m.id ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
            )}
          >
            {m.id === "seller" ? "Vendedor" : m.id === "support" ? "Soporte" : "10k / dev"}
          </button>
        ))}
      </div>
      <article className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">{current.for}</p>
        <h2 className="mt-1 font-display text-2xl tracking-tight">{current.title}</h2>
        <ol className="mt-4 space-y-4">
          {current.blocks.map((b) => (
            <li key={b.h}>
              <p className="text-sm font-medium">{b.h}</p>
              <p className="mt-1 text-sm text-muted">{b.p}</p>
            </li>
          ))}
        </ol>
        <Button
          variant="secondary"
          className="mt-5"
          onClick={() => {
            printSlip(
              current.title,
              current.blocks.flatMap((b) => [b.h, b.p, ""]),
            );
          }}
        >
          Imprimir
        </Button>
      </article>
    </div>
  );
}
