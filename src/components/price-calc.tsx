import { useMemo, useState } from "react";
import { Tag } from "lucide-react";
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
import { formatARS, formatMiles } from "@/lib/format";
import { factorFor, quotedPrice, roundPrice, unitCost, type InvoiceKind } from "@/lib/pricing";
import { useImanStore } from "@/lib/store";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

const SELECT = "h-11 w-full rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)]";
const PILL = "h-8 rounded-full px-3 text-xs font-medium";

/** El multiplicador se lee "1,5", no "1.5". */
function verFactor(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

/**
 * Consulta de precios para el encargado: a cuánto vender algo que llegó con un
 * costo nuevo, sin tener que llamar al dueño. No escribe nada — los
 * multiplicadores y el redondeo se siguen tocando solo en el panel del dueño.
 */
export function PriceCalcButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Tag className="size-4" />
        Precios
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(34rem,calc(100vw-24px))]">
          <DialogHeader>
            <DialogTitle>Precios</DialogTitle>
            <DialogDescription>
              A cuánto vender. Los márgenes los pone el dueño; acá solo se consulta.
            </DialogDescription>
          </DialogHeader>
          <PriceCalc />
        </DialogContent>
      </Dialog>
    </>
  );
}

function PriceCalc() {
  const products = useImanStore((s) => s.products);
  const categories = useImanStore((s) => s.categories);
  const settings = useImanStore((s) => s.settings);

  const [modo, setModo] = useState<"producto" | "costo">("producto");
  const [productId, setProductId] = useState("");
  const [catId, setCatId] = useState("");
  const [costo, setCosto] = useState("");

  const step = settings.roundStep && settings.roundStep > 0 ? settings.roundStep : 100;
  const mode = settings.roundMode === "down" ? "down" : "up";
  const redondeo = `redondeo ${formatMiles(step)} ${mode === "down" ? "abajo" : "arriba"}`;

  const lista = useMemo(
    () => products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [products],
  );
  const producto = lista.find((p) => p.id === productId) ?? null;
  const rubroDe = (id: string): Category =>
    categories.find((c) => c.id === id) ?? { id, name: "", sort: 0 };

  const costoSuelto = Number(costo.replace(/[^\d]/g, "")) || 0;
  const rubro = modo === "producto" ? (producto ? rubroDe(producto.categoryId) : null) : rubroDe(catId);
  const cost = modo === "producto" ? (producto ? unitCost(producto) : null) : costoSuelto || null;

  function sugerido(kind: InvoiceKind): { factor: number; precio: number } | null {
    if (!rubro) return null;
    const factor = factorFor(rubro, kind, settings);
    if (modo === "producto") {
      if (!producto) return null;
      const precio = quotedPrice(producto, factor, step, mode);
      return precio == null ? null : { factor, precio };
    }
    if (!costoSuelto) return null;
    return { factor, precio: roundPrice(costoSuelto * factor, step, mode) };
  }

  return (
    <div className="mt-1">
      <div className="flex gap-1.5">
        <button
          type="button"
          className={cn(PILL, modo === "producto" ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
          onClick={() => setModo("producto")}
        >
          Por producto
        </button>
        <button
          type="button"
          className={cn(PILL, modo === "costo" ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
          onClick={() => setModo("costo")}
        >
          Por costo suelto
        </button>
      </div>

      {modo === "producto" ? (
        <div className="mt-3">
          <Label>Producto</Label>
          <select className={SELECT} value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Elegí un producto</option>
            {lista.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {producto ? (
            <p className="mt-2 text-sm text-muted">
              {rubro?.name || "Sin rubro"} ·{" "}
              {cost == null ? "sin costo cargado" : <>costo <span className="num">{formatARS(cost)}</span></>}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Rubro</Label>
            <select className={SELECT} value={catId} onChange={(e) => setCatId(e.target.value)}>
              <option value="">Elegí un rubro</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Costo por unidad</Label>
            <Input
              inputMode="numeric"
              placeholder="0"
              value={costo}
              onChange={(e) => setCosto(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
        </div>
      )}

      {modo === "producto" && producto && cost == null ? (
        <p className="mt-4 rounded-lg bg-elevated p-3 text-sm text-muted">
          Este producto no tiene costo cargado.
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {(["X", "A"] as InvoiceKind[]).map((kind) => {
          const r = sugerido(kind);
          return (
            <div key={kind} className="rounded-lg bg-elevated p-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
                Fac {kind}
              </span>
              <p className="num mt-1 text-2xl font-medium leading-none">
                {r ? formatARS(r.precio) : "—"}
              </p>
              <p className="mt-1.5 text-xs leading-snug text-muted">
                {r && cost != null
                  ? `costo ${formatARS(cost)} × ${verFactor(r.factor)}, ${redondeo}`
                  : modo === "producto"
                    ? producto
                      ? ""
                      : "Elegí un producto"
                    : rubro?.name
                      ? "Poné el costo"
                      : "Elegí un rubro"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
