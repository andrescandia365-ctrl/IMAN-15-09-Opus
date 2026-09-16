import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { formatARS, formatMiles, todayKey } from "@/lib/format";
import {
  LEDGER_ROWS,
  LEDGER_TINTS,
  LOCKED_LEDGER,
  cellValue,
  currentYm,
  formatDayHead,
  monthDates,
  monthTitle,
  rowTitle,
  tintOf,
} from "@/lib/ledger";
import { useImanStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useDragScroll } from "@/lib/drag-scroll";

const INPUT_ROWS = LEDGER_ROWS.filter((r) => r.kind === "input").map((r) => r.id);

function focusLedger(rowId: string, date: string) {
  const el = document.querySelector<HTMLInputElement>(`input[data-ld="${rowId}:${date}"]`);
  if (!el) return;
  el.focus();
  el.select();
}

function onLedgerKey(e: KeyboardEvent<HTMLInputElement>, rowId: string, date: string, dates: string[]) {
  const ri = INPUT_ROWS.indexOf(rowId);
  const ci = dates.indexOf(date);
  if (ri < 0 || ci < 0) return;
  let nr = ri;
  let nc = ci;
  if (e.key === "ArrowRight") nc += 1;
  else if (e.key === "ArrowLeft") nc -= 1;
  else if (e.key === "ArrowDown" || e.key === "Enter") nr += 1;
  else if (e.key === "ArrowUp") nr -= 1;
  else return;
  if (nr < 0 || nr >= INPUT_ROWS.length || nc < 0 || nc >= dates.length) return;
  e.preventDefault();
  focusLedger(INPUT_ROWS[nr]!, dates[nc]!);
}

const LINE = "border-b border-r border-ink/25";
const RUBRO =
  "sticky left-0 z-20 min-w-[10rem] bg-paper px-2 py-1 text-left text-sm font-medium leading-tight tracking-tight text-ink";
const FECHA_CORNER =
  "sticky left-0 top-0 z-40 min-w-[10rem] bg-paper px-2 py-1.5 text-left text-xs font-medium uppercase tracking-[0.14em] text-ink-muted";
const DATE_CELL =
  "sticky top-0 z-30 min-w-[4.25rem] select-none bg-paper px-1.5 py-1.5 text-center text-ink-muted";

export function EncargadoBook({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const ym = currentYm();
  return (
    <section className="rounded-xl bg-surface shadow-[var(--shadow-border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span>
          <span className="block text-xs font-medium uppercase tracking-[0.14em] text-subtle">Encargado</span>
          <span className="mt-0.5 block font-display text-xl tracking-tight">Asientos · {monthTitle(ym)}</span>
        </span>
        <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="h-[min(36rem,70dvh)] min-h-0 border-t border-border px-3 pb-3 pt-2">
          <LedgerSheet ym={ym} editable />
        </div>
      ) : null}
    </section>
  );
}

export function LedgerSheet({ ym, editable }: { ym: string; editable: boolean }) {
  const books = useImanStore((s) => s.books);
  const sheets = useImanStore((s) => s.monthSheets);
  const setLedgerCell = useImanStore((s) => s.setLedgerCell);
  const saveSettings = useImanStore((s) => s.saveSettings);
  const labels = useImanStore((s) => s.settings.ledgerLabels);
  const dates = useMemo(() => monthDates(ym), [ym]);
  const today = todayKey();
  const scroller = useDragScroll<HTMLDivElement>();
  const live = useMemo(() => {
    const ofYm = books.filter((b) => b.date.startsWith(ym));
    if (ofYm.length) return books;
    const sheet = sheets.find((s) => s.ym === ym);
    if (!sheet) return books;
    return sheet.days.map((d) => ({
      date: d.date,
      safeCount: d.cells.caja ?? 0,
      virtualCel: d.cells.ventas_virtuales ?? 0,
      virtualSube: 0,
      facA: d.cells.fac_a ?? 0,
      facX: d.cells.fac_x ?? 0,
      cigarrillos: d.cells.cigarrillos ?? 0,
      expenses: [],
      notes: "",
      cells: d.cells,
    }));
  }, [books, sheets, ym]);

  function setRowLabel(rowId: string, name: string) {
    saveSettings({ ledgerLabels: { ...(labels ?? {}), [rowId]: name } });
  }

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const col = root.querySelector<HTMLElement>('[data-today="1"]');
    col?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [ym, dates]);

  return (
    <div
      ref={scroller}
      className="ledger-sheet no-scrollbar h-full min-h-0 cursor-grab touch-none overflow-auto rounded-lg bg-paper text-ink select-none active:cursor-grabbing"
    >
      <table className="min-w-max border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={cn(FECHA_CORNER, LINE)}>Fecha</th>
            {dates.map((d) => {
              const head = formatDayHead(d);
              const isToday = d === today;
              return (
                <th
                  key={d}
                  data-today={isToday ? "1" : undefined}
                  className={cn(DATE_CELL, LINE, isToday && "bg-paper text-ink")}
                >
                  <span className="block font-display text-base leading-none tracking-tight">{head.n}</span>
                  <span className="mt-0.5 block text-xs uppercase leading-none tracking-[0.08em] opacity-80">
                    {head.wd}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {LEDGER_ROWS.map((row) => {
            if (row.kind === "spacer") {
              return (
                <tr key={row.id} className="h-1.5">
                  <td className={cn(RUBRO, LINE, "py-0")} />
                  {dates.map((d) => (
                    <td
                      key={d}
                      data-today-col={d === today ? "1" : undefined}
                      className={cn(LINE, "bg-paper")}
                    />
                  ))}
                </tr>
              );
            }
            const tint = tintOf(row.id);
            const tintDef = LEDGER_TINTS.find((t) => t.id === tint)!;
            const title = rowTitle(row, labels);
            const locked = LOCKED_LEDGER.has(row.id);
            return (
              <tr key={row.id}>
                <th className={cn(RUBRO, LINE, "align-middle")}>
                  {editable && !locked ? (
                    <input
                      className="w-full bg-transparent text-sm font-medium leading-tight tracking-tight text-ink outline-none placeholder:text-ink-muted"
                      defaultValue={title}
                      placeholder="Gasto"
                      onBlur={(e) => setRowLabel(row.id, e.target.value.trim())}
                    />
                  ) : (
                    <span className="block text-sm font-medium leading-tight tracking-tight">{title || "—"}</span>
                  )}
                </th>
                {dates.map((d) => {
                  const v = cellValue(live, d, row.id);
                  const filled = v !== 0;
                  const todayCol = d === today;
                  const paint = filled ? tintDef.cell : "bg-paper";
                  if (!editable || row.kind === "formula") {
                    return (
                      <td
                        key={d}
                        data-today-col={todayCol ? "1" : undefined}
                        data-fill={filled ? "1" : undefined}
                        className={cn(
                          LINE,
                          "px-1.5 py-1 text-right font-mono text-sm leading-tight text-ink",
                          paint,
                        )}
                      >
                        {v ? formatARS(v) : ""}
                      </td>
                    );
                  }
                  return (
                    <td
                      key={d}
                      data-today-col={todayCol ? "1" : undefined}
                      data-fill={filled ? "1" : undefined}
                      className={cn(LINE, "p-0", paint)}
                    >
                      <input
                        data-ld={`${row.id}:${d}`}
                        className={cn(
                          "h-8 w-full min-w-[4.25rem] cursor-text select-text bg-transparent px-1.5 text-right font-mono text-sm leading-tight text-ink outline-none",
                          filled && "font-medium",
                        )}
                        inputMode="numeric"
                        defaultValue={v ? formatMiles(v) : ""}
                        onFocus={(e) => {
                          // Se escribe en crudo y se lee con puntos de mil.
                          e.currentTarget.value = v ? String(v) : "";
                          e.currentTarget.select();
                        }}
                        onKeyDown={(e) => onLedgerKey(e, row.id, d, dates)}
                        onBlur={(e) => {
                          const n = Number(e.target.value.replace(/[^\d]/g, "")) || 0;
                          e.currentTarget.value = n ? formatMiles(n) : "";
                          setLedgerCell(d, row.id, n);
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
