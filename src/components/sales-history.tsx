import { formatARS, formatDateTime, PAY_LABEL } from "@/lib/format";
import { ticketPrintOpts, printTicket } from "@/lib/print";
import { useImanStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function SalesHistory({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const sales = useImanStore((s) => s.sales);
  const settings = useImanStore((s) => s.settings);
  const openReceipt = useImanStore((s) => s.openReceipt);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const rows = sales.filter((s) => new Date(s.createdAt).getTime() >= weekAgo).slice(0, 80);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-3">
        <p className="font-display text-xl tracking-tight">Ventas · 7 días</p>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {rows.length === 0 ? (
            <li className="py-8 text-center text-sm text-subtle">Todavía no hay tickets de esta semana.</li>
          ) : (
            rows.map((s) => (
              <li key={s.id} className="rounded-lg bg-surface px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="num text-sm font-medium">{formatARS(s.total)}</span>
                  <span className="text-[11px] text-subtle">{PAY_LABEL[s.paymentMethod]}</span>
                </div>
                <p className="text-[11px] text-muted">{formatDateTime(s.createdAt)}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openReceipt(s.id)}>
                    Ver
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void printTicket({ sale: s, store: settings.name, city: settings.city, baud: settings.printerBaud, ...ticketPrintOpts(settings) })}
                  >
                    Reimprimir
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
