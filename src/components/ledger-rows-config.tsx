import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CAJA_LEDGER,
  LEDGER_TAG_IDS,
  LEDGER_TAG_LABEL,
  LOCKED_LEDGER,
  resolveLedgerRows,
  slugLedger,
  tagLabel,
} from "@/lib/ledger";
import type { LedgerRow, LedgerTagDef } from "@/lib/types";
import { useImanStore } from "@/lib/store";
import { cn, uid } from "@/lib/utils";

function tagOptions(extra: LedgerTagDef[]): { id: string; label: string }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string }[] = [];
  for (const id of LEDGER_TAG_IDS) {
    seen.add(id);
    out.push({ id, label: LEDGER_TAG_LABEL[id] });
  }
  for (const t of extra) {
    if (!t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push({ id: t.id, label: t.label });
  }
  return out;
}

export function LedgerRowsConfig() {
  const settings = useImanStore((s) => s.settings);
  const saveSettings = useImanStore((s) => s.saveSettings);
  const rows = resolveLedgerRows(settings);
  const tags = settings.ledgerTags ?? [];
  const options = tagOptions(tags);
  const [nuevoTag, setNuevoTag] = useState("");

  function saveRows(next: LedgerRow[]) {
    const labels: Record<string, string> = { ...(settings.ledgerLabels ?? {}) };
    for (const r of next) labels[r.id] = r.label;
    saveSettings({ ledgerRows: next, ledgerLabels: labels });
  }

  function addRow() {
    saveRows([...rows, { id: uid("fila"), label: "", kind: "input", tag: "gasto" }]);
  }

  function addTag() {
    const label = nuevoTag.trim();
    if (!label) return;
    const id = slugLedger(label);
    if (options.some((t) => t.id === id)) return;
    saveSettings({ ledgerTags: [...tags, { id, label }] });
    setNuevoTag("");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">El encargado las ve y carga. Vos armás cuáles hay.</p>
      <ul className="space-y-2">
        {rows.map((row) => {
          if (row.kind === "spacer") return null;
          const locked = LOCKED_LEDGER.has(row.id);
          const fija = locked || CAJA_LEDGER.has(row.id);
          return (
            <li
              key={row.id}
              className={cn(
                "flex flex-col gap-2 rounded-md bg-bg px-3 py-2 sm:flex-row sm:items-center",
                row.hidden && "opacity-60",
              )}
            >
              <Input
                className="min-w-0 flex-1"
                defaultValue={row.label}
                placeholder={tagLabel(row.tag, tags) || "Nombre"}
                disabled={locked}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name === row.label) return;
                  saveRows(rows.map((r) => (r.id === row.id ? { ...r, label: name } : r)));
                }}
              />
              {row.kind === "input" ? (
                <select
                  className="h-11 rounded-md bg-elevated px-3 text-sm shadow-[var(--shadow-border)]"
                  value={row.tag ?? "otro"}
                  disabled={fija}
                  onChange={(e) =>
                    saveRows(rows.map((r) => (r.id === row.id ? { ...r, tag: e.target.value } : r)))
                  }
                >
                  {options.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-subtle sm:w-28">No se toca</span>
              )}
              {locked ? null : fija ? (
                <span className="text-xs text-subtle">Siempre visible</span>
              ) : (
                <button
                  type="button"
                  className="h-11 shrink-0 rounded-md px-3 text-sm text-muted hover:bg-elevated hover:text-fg"
                  onClick={() =>
                    saveRows(rows.map((r) => (r.id === row.id ? { ...r, hidden: !r.hidden } : r)))
                  }
                >
                  {row.hidden ? "Mostrar" : "Ocultar"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-subtle">Ocultar no borra lo que ya se cargó.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="secondary" onClick={addRow}>
          Agregar fila
        </Button>
        <div className="flex min-w-0 flex-1 gap-2">
          <Input
            value={nuevoTag}
            onChange={(e) => setNuevoTag(e.target.value)}
            placeholder="Tag nuevo"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button type="button" variant="secondary" disabled={!nuevoTag.trim()} onClick={addTag}>
            Crear tag
          </Button>
        </div>
      </div>
    </div>
  );
}
