import { formatARS, formatDateTime, PAY_LABEL } from "@/lib/format";
import { TICKET_FISCAL_HINT, TICKET_NOT_FISCAL } from "@/lib/fiscal";
import { packOf } from "@/lib/pack";
import { printTicket } from "@/lib/print";
import { usePhoneUi } from "@/lib/device";
import { useImanStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function ReceiptDialog() {
  const open = useImanStore((s) => s.receiptOpen);
  const celu = usePhoneUi();
  const close = useImanStore((s) => s.closeReceipt);
  const lastId = useImanStore((s) => s.lastSaleId);
  const sales = useImanStore((s) => s.sales);
  const products = useImanStore((s) => s.products);
  const refunds = useImanStore((s) => s.refunds);
  const refundCliente = useImanStore((s) => s.refundCliente);
  const name = useImanStore((s) => s.settings.name);
  const city = useImanStore((s) => s.settings.city);
  const baud = useImanStore((s) => s.settings.printerBaud);
  const sale = sales.find((s) => s.id === lastId) ?? sales[0] ?? null;
  if (!sale) return null;

  const change =
    sale.paymentMethod === "efectivo" && sale.paid != null ? Math.max(0, sale.paid - sale.total) : 0;
  const nro = sale.id.replace(/^sa_/, "").slice(-8).toUpperCase();
  const pay = PAY_LABEL[sale.paymentMethod];

  function giveBack(productId: string, units: number) {
    const r = refundCliente({
      productId,
      units,
      paymentMethod: sale!.paymentMethod,
      saleId: sale!.id,
    });
    if (!r.ok) toast.error(r.error);
    else toast.success(`Devolución ${units} u.`);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden bg-paper text-ink">
        <DialogHeader>
          <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-muted">Ticket</p>
          <DialogTitle className="text-center font-display text-2xl">{name}</DialogTitle>
          <DialogDescription className="text-center text-ink-muted">
            {city ? `${city} · ` : ""}
            {formatDateTime(sale.createdAt)}
            <br />
            Ticket {nro} · {pay}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">
              <th className="py-1 text-left font-medium">Cant</th>
              <th className="py-1 text-left font-medium">Producto</th>
              <th className="py-1 text-right font-medium">P. unit</th>
              <th className="py-1 text-right font-medium">Imp.</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((it, i) => {
              const already = refunds
                .filter((r) => r.saleId === sale.id && r.productId === it.productId)
                .reduce((a, r) => a + r.units, 0);
              const left = it.qty - already;
              const p = products.find((x) => x.id === it.productId);
              const pack = packOf(p);
              return (
                <tr key={`${it.productId}-${i}`} className="border-t border-dashed border-ink/15">
                  <td className="py-1.5 align-top num">{it.qty}</td>
                  <td className="py-1.5 pr-2">
                    {it.name}
                    {left > 0 ? (
                      <div className="mt-1 flex gap-1">
                        <Button size="sm" variant="secondary" onClick={() => giveBack(it.productId, 1)}>
                          Devolver 1
                        </Button>
                        {pack > 1 && left >= pack ? (
                          <Button size="sm" variant="secondary" onClick={() => giveBack(it.productId, pack)}>
                            Pack
                          </Button>
                        ) : null}
                      </div>
                    ) : already > 0 ? (
                      <span className="block text-[11px] text-ink-muted">Devuelto</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-right num">{formatARS(it.price)}</td>
                  <td className="py-1.5 text-right num">{formatARS(it.price * it.qty)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <div className="min-h-[100px] shrink-0">
        <div className="flex items-end justify-between border-t border-dashed border-ink/20 pt-3">
          <span className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">Total</span>
          <span className="num text-3xl font-medium">{formatARS(sale.total)}</span>
        </div>
        <p className="text-sm text-ink-muted">
          {pay}
          {sale.paid != null ? ` · pagó ${formatARS(sale.paid)}` : ""}
          {change > 0 ? ` · vuelto ${formatARS(change)}` : ""}
        </p>
        <p className="text-center text-xs text-ink-muted">Números claros. Local que crece.</p>
        <p className="text-center text-[11px] leading-snug text-ink-muted">
          {TICKET_NOT_FISCAL} {TICKET_FISCAL_HINT}
        </p>
        <div className="mt-3 flex gap-2">
          {/* El kiosco sin PC no imprime: en el celu no hay impresora. */}
          {celu ? null : (
          <Button
            className="flex-1"
            variant="secondary"
            onClick={() => {
              void printTicket({
                sale,
                store: name,
                city,
                baud: baud ?? 9600,
              }).then((ok) => {
                if (!ok) toast.error("Permití ventanas emergentes o conectá la USB");
              });
            }}
          >
            Imprimir
          </Button>
          )}
          <Button className="flex-1" onClick={close}>
            Listo
          </Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
