import { useMemo, useState } from "react";
import { Minus, PackagePlus, Pencil, Plus, ScanBarcode, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CameraScan } from "@/components/camera-scan";
import { VenceField } from "@/components/vence-field";
import { daysUntil, formatARS } from "@/lib/format";
import { BORRADO_MIENTRAS_EDITABAS } from "@/lib/deleted";
import { lotsOf, soonestExpiry, unallocated } from "@/lib/lots";
import { findByScan, packOf, productMatchesQuery, stockBreakdown } from "@/lib/pack";
import { useImanStore } from "@/lib/store";
import type { Product } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

export function PhoneStockView() {
  const products = useImanStore((s) => s.products);
  const categories = useImanStore((s) => s.categories);
  const adjustStock = useImanStore((s) => s.adjustStock);
  const saveProduct = useImanStore((s) => s.saveProduct);
  const deleteProduct = useImanStore((s) => s.deleteProduct);
  const [q, setQ] = useState("");
  const [low, setLow] = useState(false);
  const [cam, setCam] = useState<"find" | "alta" | null>(null);
  const [edit, setEdit] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Product | null>(null);
  const [tab, setTab] = useState<"rapida" | "detalles">("rapida");

  const list = useMemo(() => {
    return products
      .filter((p) => p.active)
      .filter((p) => (low ? p.stock <= p.stockMin : true))
      .filter((p) => {
        const n = q.trim().toLowerCase();
        if (!n) return true;
        return productMatchesQuery(p, q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [products, q, low]);

  function startNew(barcode = "") {
    setDraft({
      id: uid("p"),
      name: "",
      barcode,
      price: 0,
      cost: null,
      stock: 0,
      stockMin: 0,
      packQty: 1,
      packBarcode: "",
      categoryId: categories[0]?.id ?? "kio",
      active: true,
      expiresAt: null,
      priceUpdatedAt: new Date().toISOString(),
      onOffer: false,
    });
    setTab("rapida");
    setOpen(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl tracking-tight">Stock</h2>
          <p className="text-xs text-subtle">Unidades o packs. El camión se recibe en Llegó.</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={() => setEdit((v) => !v)}>
            {edit ? "Listo" : "Editar"}
          </Button>
          <Button size="sm" onClick={() => startNew()}>
            <PackagePlus className="size-4" />
            Alta
          </Button>
        </div>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto" className="pl-10 pr-12" />
        <button
          type="button"
          className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-muted"
          onClick={() => setCam("find")}
          aria-label="Cámara"
        >
          <ScanBarcode className="size-5" />
        </button>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setLow(false)}
          className={cn("h-9 rounded-full px-3 text-sm", !low ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
        >
          Todos
        </button>
        <button
          type="button"
          onClick={() => setLow(true)}
          className={cn("h-9 rounded-full px-3 text-sm", low ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
        >
          Bajo
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {list.map((p) => {
          const pack = packOf(p);
          return (
            <li key={p.id} className="rounded-xl bg-surface px-3 py-3 shadow-[var(--shadow-border)]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="font-mono text-[11px] text-subtle">{p.barcode}</p>
                  {pack > 1 ? <p className="text-xs text-muted">1 pack = {pack} u.</p> : null}
                </div>
                <p className={cn("num shrink-0 text-lg", p.stock <= p.stockMin ? "text-warn" : "text-sage")}>
                  {stockBreakdown(p)}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-md bg-elevated"
                  onClick={() => adjustStock(p.id, -1, "ajuste")}
                  aria-label="Quitar uno"
                >
                  <Minus className="size-4" />
                </button>
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-md bg-elevated"
                  onClick={() => adjustStock(p.id, 1, "ajuste")}
                  aria-label="Sumar uno"
                >
                  <Plus className="size-4" />
                </button>
                {pack > 1 ? (
                  <>
                    <button
                      type="button"
                      className="h-11 rounded-md bg-elevated px-3 text-xs"
                      onClick={() => adjustStock(p.id, -pack, "ajuste")}
                    >
                      −pack
                    </button>
                    <button
                      type="button"
                      className="h-11 rounded-md bg-elevated px-3 text-xs"
                      onClick={() => adjustStock(p.id, pack, "ajuste")}
                    >
                      +pack
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-md bg-elevated"
                  onClick={() => {
                    setDraft({ ...p });
                    setTab("rapida");
                    setOpen(true);
                  }}
                  aria-label="Editar"
                >
                  <Pencil className="size-4" />
                </button>
                {edit ? (
                  <button
                    type="button"
                    className="grid size-11 place-items-center rounded-md text-danger"
                    onClick={() => {
                      deleteProduct(p.id);
                      toast("Producto quitado");
                    }}
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <ProductPhoneDialog
        open={open}
        tab={tab}
        setTab={setTab}
        product={draft}
        onChange={setDraft}
        onScanCode={() => setCam("alta")}
        onSave={() => {
          if (!draft || !draft.name.trim() || draft.price < 0) {
            toast.error("Nombre y precio son obligatorios");
            return;
          }
          const r = saveProduct({ ...draft, name: draft.name.trim(), priceUpdatedAt: new Date().toISOString() });
          setOpen(false);
          if (r.borrado) {
            toast.error(BORRADO_MIENTRAS_EDITABAS);
            return;
          }
          toast.success("Producto guardado");
        }}
        onClose={() => setOpen(false)}
      />

      {cam ? (
        <CameraScan
          onClose={() => setCam(null)}
          onCode={(code) => {
            if (cam === "alta") {
              const hit = findByScan(products, code);
              if (hit) {
                setDraft({ ...hit.product });
                setTab("rapida");
                setOpen(true);
                toast("Ya está. Revisá el alta.");
              } else {
                startNew(code);
              }
              setCam(null);
              return;
            }
            const hit = findByScan(products, code);
            setQ(hit?.product.barcode ?? code);
            setLow(false);
            if (!hit) toast.error(`No está: ${code}`);
            setCam(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ProductPhoneDialog({
  open,
  tab,
  setTab,
  product,
  onChange,
  onScanCode,
  onSave,
  onClose,
}: {
  open: boolean;
  tab: "rapida" | "detalles";
  setTab: (t: "rapida" | "detalles") => void;
  product: Product | null;
  onChange: (p: Product) => void;
  onScanCode: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const categories = useImanStore((s) => s.categories);
  if (!product) return null;
  const set = (patch: Partial<Product>) => onChange({ ...product, ...patch });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product.name ? "Editar" : "Alta rápida"}</DialogTitle>
          <DialogDescription>Nombre, código y precio para vender. Pack en Detalles.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5">
          <button
            type="button"
            className={cn("h-8 rounded-full px-3 text-xs font-medium", tab === "rapida" ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
            onClick={() => setTab("rapida")}
          >
            Alta rápida
          </button>
          <button
            type="button"
            className={cn("h-8 rounded-full px-3 text-xs font-medium", tab === "detalles" ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
            onClick={() => setTab("detalles")}
          >
            Detalles
          </button>
        </div>
        {tab === "rapida" ? (
          <div className="grid gap-3">
            <div>
              <Label>Nombre</Label>
              <Input value={product.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div>
              <Label>Código</Label>
              <div className="flex gap-2">
                <Input value={product.barcode} onChange={(e) => set({ barcode: e.target.value })} />
                <Button type="button" variant="secondary" className="shrink-0" onClick={onScanCode}>
                  <ScanBarcode className="size-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Precio</Label>
              <Input inputMode="numeric" value={product.price || ""} onChange={(e) => set({ price: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Rubro</Label>
              <select
                className="flex h-11 w-full rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)]"
                value={product.categoryId}
                onChange={(e) => set({ categoryId: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Pack (u. del bulto)</Label>
              <Input
                inputMode="numeric"
                value={product.packQty ?? 1}
                onChange={(e) => set({ packQty: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
            <div>
              <Label>Costo por unidad</Label>
              <Input
                inputMode="numeric"
                value={product.cost ?? ""}
                onChange={(e) => set({ cost: e.target.value === "" ? null : Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Mínimo</Label>
              <Input inputMode="numeric" value={product.stockMin} onChange={(e) => set({ stockMin: Number(e.target.value) || 0 })} />
            </div>
            <VenceField product={product} onChange={(expiresAt) => set({ expiresAt })} />
            <div className="col-span-2 flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={Boolean(product.onOffer)} onChange={(e) => set({ onOffer: e.target.checked })} />
              Oferta
            </div>
          </div>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSave}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PhoneExpireView() {
  const products = useImanStore((s) => s.products);
  const saveProduct = useImanStore((s) => s.saveProduct);
  const dateLot = useImanStore((s) => s.dateLot);
  const [q, setQ] = useState("");
  const [cam, setCam] = useState(false);
  const [pick, setPick] = useState<Product | null>(null);
  const [date, setDate] = useState("");
  const [qty, setQty] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out: { product: Product; date: string; units: number; lotId?: string }[] = [];
    for (const p of products.filter((x) => x.active)) {
      if (needle && !p.name.toLowerCase().includes(needle) && !p.barcode.includes(needle)) continue;
      const lots = lotsOf(p);
      if (lots.length) {
        for (const l of lots) out.push({ product: p, date: l.expiresAt, units: l.units, lotId: l.id });
      } else if (p.expiresAt) {
        out.push({ product: p, date: p.expiresAt, units: p.stock });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.product.name.localeCompare(b.product.name, "es"));
  }, [products, q]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div>
        <h2 className="font-display text-2xl tracking-tight">Vencimientos</h2>
        <p className="text-xs text-subtle">Producto, fecha, cantidad. Recorré 1 o 2 veces al mes.</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar o escanear" className="pl-10 pr-12" />
        <button
          type="button"
          className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-muted"
          onClick={() => setCam(true)}
          aria-label="Cámara"
        >
          <ScanBarcode className="size-5" />
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {rows.length === 0 ? (
          <li className="py-10 text-center text-sm text-subtle">Nada con fecha. Escaneá y anotá un lote.</li>
        ) : (
          rows.map((r) => {
            const d = daysUntil(r.date);
            return (
              <li key={`${r.product.id}-${r.lotId ?? r.date}`} className="rounded-xl bg-surface px-3 py-3 shadow-[var(--shadow-border)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.product.name}</p>
                    <p className="text-xs text-subtle">{r.units} u. · {r.date}</p>
                  </div>
                  {d !== null && d <= 0 ? (
                    <Badge variant="danger">Vencido</Badge>
                  ) : d !== null && d <= 7 ? (
                    <Badge variant="warn">{d} d</Badge>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          const hit = products.find(
            (p) => p.active && (p.name.toLowerCase().includes(q.trim().toLowerCase()) || p.barcode === q.trim()),
          );
          if (!hit) {
            toast.error("Buscá o escaneá un producto");
            return;
          }
          setPick(hit);
          setDate("");
          setQty(String(unallocated(hit) || ""));
        }}
      >
        Añadir fecha
      </Button>

      <Dialog open={Boolean(pick)} onOpenChange={(v) => !v && setPick(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pick?.name}</DialogTitle>
            <DialogDescription>
              {pick ? `${unallocated(pick)} u. sin fecha. Vence primero: ${soonestExpiry(pick) ?? "—"}` : ""}
            </DialogDescription>
          </DialogHeader>
          <Label>Fecha</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Label>Unidades de este lote</Label>
          <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} />
          {pick && packOf(pick) > 1 ? (
            <p className="text-xs text-muted">1 pack = {packOf(pick)} u.</p>
          ) : null}
          <Button
            onClick={() => {
              if (!pick) return;
              const r = dateLot(pick.id, date, Number(qty) || 0);
              if (!r.ok) toast.error(r.error);
              else {
                toast.success("Lote anotado");
                setPick(null);
              }
            }}
          >
            Guardar lote
          </Button>
        </DialogContent>
      </Dialog>

      {cam ? (
        <CameraScan
          onClose={() => setCam(false)}
          onCode={(code) => {
            const hit = findByScan(products, code);
            setCam(false);
            if (!hit) {
              toast.error(`No está: ${code}`);
              return;
            }
            setQ(hit.product.barcode);
            setPick(hit.product);
            setDate("");
            setQty(String(unallocated(hit.product) || ""));
          }}
        />
      ) : null}
    </div>
  );
}
