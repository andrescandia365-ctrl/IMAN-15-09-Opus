import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatARS } from "@/lib/format";
import { packOf } from "@/lib/pack";
import { FAC_LINES, type FacLine } from "@/lib/ledger";
import { useImanStore } from "@/lib/store";
import type { PayMethod, Product, Sale, Supplier } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ClienteRefundDialog({
  open,
  onOpenChange,
  sale,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sale?: Sale | null;
}) {
  const products = useImanStore((s) => s.products);
  const refunds = useImanStore((s) => s.refunds);
  const refundCliente = useImanStore((s) => s.refundCliente);
  const payMethod = useImanStore((s) => s.payMethod);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Product | null>(null);
  const [units, setUnits] = useState(1);
  const [method, setMethod] = useState<PayMethod>(sale?.paymentMethod ?? payMethod);

  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return products.filter((p) => p.active).slice(0, 8);
    return products
      .filter(
        (p) =>
          p.active &&
          (p.name.toLowerCase().includes(n) || p.barcode.includes(n) || (p.packBarcode ?? "").includes(n)),
      )
      .slice(0, 8);
  }, [products, q]);

  function reset() {
    setQ("");
    setPick(null);
    setUnits(1);
  }

  function apply(p: Product, n: number) {
    const r = refundCliente({
      productId: p.id,
      units: n,
      paymentMethod: method,
      saleId: sale?.id,
    });
    if (!r.ok) toast.error(r.error);
    else {
      toast.success(`Devolución ${n} u. · ${p.name}`);
      reset();
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Devolver al cliente</DialogTitle>
          <DialogDescription>
            Vuelve a góndola en unidades. Un pack de Coca x8 es +8, no +1. Sale la plata del mismo medio.
          </DialogDescription>
        </DialogHeader>
        {sale ? (
          <ul className="space-y-2">
            {sale.items.map((it) => {
              const already = refunds
                .filter((r) => r.saleId === sale.id && r.productId === it.productId)
                .reduce((a, r) => a + r.units, 0);
              const left = it.qty - already;
              const p = products.find((x) => x.id === it.productId);
              const pack = packOf(p);
              if (!p || left <= 0) {
                return (
                  <li key={it.productId} className="text-sm text-subtle">
                    {it.name} · {left <= 0 ? "ya devuelto" : "sin ficha"}
                  </li>
                );
              }
              return (
                <li key={it.productId} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-bg px-3 py-2">
                  <span className="min-w-0 text-sm">
                    {it.name}
                    <span className="ml-2 font-mono text-[11px] text-subtle">{left} u.</span>
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => apply(p, 1)}>
                      1 u.
                    </Button>
                    {pack > 1 && left >= pack ? (
                      <Button size="sm" onClick={() => apply(p, pack)}>
                        Pack x{pack}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o código" />
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {hits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                      pick?.id === p.id ? "bg-elevated" : "hover:bg-elevated",
                    )}
                    onClick={() => {
                      setPick(p);
                      setUnits(1);
                    }}
                  >
                    <span>{p.name}</span>
                    <span className="font-mono text-[11px] text-subtle">
                      {p.stock} u.{packOf(p) > 1 ? ` · pack x${packOf(p)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {pick ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-sm bg-elevated"
                  onClick={() => setUnits((n) => Math.max(1, n - 1))}
                >
                  −
                </button>
                <span className="num w-8 text-center">{units}</span>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-sm bg-elevated"
                  onClick={() => setUnits((n) => n + 1)}
                >
                  +
                </button>
                {packOf(pick) > 1 ? (
                  <Button size="sm" variant="secondary" onClick={() => setUnits(packOf(pick))}>
                    1 pack
                  </Button>
                ) : null}
                <span className="text-sm text-muted">{formatARS(pick.price * units)}</span>
              </div>
            ) : null}
          </>
        )}
        <div className="mt-3 flex gap-1.5">
          {(["efectivo", "mercadopago", "debito"] as PayMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={cn(
                "h-9 rounded-md px-3 text-xs font-medium",
                method === m ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
              )}
            >
              {m === "mercadopago" ? "MP" : m === "debito" ? "Débito" : "Efectivo"}
            </button>
          ))}
        </div>
        {!sale && pick ? (
          <Button className="mt-3 w-full" onClick={() => apply(pick, units)}>
            Devolver {units} u.
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ProveedorRefundDialog({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplier: Supplier | null;
}) {
  const products = useImanStore((s) => s.products);
  const refundProveedor = useImanStore((s) => s.refundProveedor);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Product | null>(null);
  const [packs, setPacks] = useState(1);
  const [facLine, setFacLine] = useState<FacLine>("fac_x");
  const [nc, setNc] = useState("");

  const hits = useMemo(() => {
    if (!supplier) return [];
    const ids = supplier.categoryIds ?? [];
    const pool = products.filter((p) => p.active && (ids.length ? ids.includes(p.categoryId) : true));
    const n = q.trim().toLowerCase();
    return (n ? pool.filter((p) => p.name.toLowerCase().includes(n) || p.barcode.includes(n)) : pool).slice(0, 10);
  }, [products, supplier, q]);

  function reset() {
    setQ("");
    setPick(null);
    setPacks(1);
    setFacLine("fac_x");
    setNc("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Devolver a {supplier?.name ?? "proveedor"}</DialogTitle>
          <DialogDescription>
            Sale de góndola. La NC baja FAC de hoy. No toca la caja chica.
          </DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qué se lleva el camión" />
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
          {hits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                  pick?.id === p.id ? "bg-elevated" : "hover:bg-elevated",
                )}
                onClick={() => setPick(p)}
              >
                <span>
                  {p.name}
                  {packOf(p) > 1 ? <span className="ml-1 text-[10px] text-subtle">pack x{packOf(p)}</span> : null}
                </span>
                <span className="font-mono text-[11px] text-subtle">{p.stock} u.</span>
              </button>
            </li>
          ))}
        </ul>
        {pick ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="grid size-8 place-items-center rounded-sm bg-elevated"
                onClick={() => setPacks((n) => Math.max(1, n - 1))}
              >
                −
              </button>
              <span className="num w-8 text-center">{packs}</span>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-sm bg-elevated"
                onClick={() => setPacks((n) => n + 1)}
              >
                +
              </button>
              <span className="text-sm text-muted">
                {packOf(pick) > 1 ? `${packs} pack = ${packs * packOf(pick)} u.` : `${packs} u.`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FAC_LINES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFacLine(f.id)}
                  className={cn(
                    "h-8 rounded-md px-3 text-xs font-medium",
                    facLine === f.id ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.08em] text-subtle">Importe NC</p>
              <Input
                inputMode="numeric"
                value={nc}
                onChange={(e) => setNc(e.target.value.replace(/[^\d]/g, ""))}
                placeholder={String((pick.cost ?? Math.round(pick.price * 0.7)) * (packOf(pick) > 1 ? packs * packOf(pick) : packs))}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                const units = packOf(pick) > 1 ? packs * packOf(pick) : packs;
                const guess = (pick.cost ?? Math.round(pick.price * 0.7)) * units;
                const r = refundProveedor({
                  supplierId: supplier!.id,
                  productId: pick.id,
                  packs: packOf(pick) > 1 ? packs : 0,
                  units,
                  facLine,
                  amount: Number(nc) || guess,
                });
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success(`−${units} u. · NC en ${FAC_LINES.find((f) => f.id === facLine)?.label}`);
                  reset();
                  onOpenChange(false);
                }
              }}
            >
              Sacar de góndola y anotar NC
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
