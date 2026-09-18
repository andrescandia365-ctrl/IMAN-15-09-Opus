import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatARS, formatMiles } from "@/lib/format";
import { productMatchesQuery } from "@/lib/pack";
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
export function PriceCalcCard() {
  return (
    <section className="rounded-xl bg-surface shadow-[var(--shadow-border)]">
      <div className="px-5 py-4">
        <span className="block text-xs font-medium uppercase tracking-[0.14em] text-subtle">Herramienta</span>
        <span className="mt-0.5 block font-display text-xl tracking-tight">Precios</span>
        <p className="mt-1 text-xs leading-snug text-muted">
          A cuánto vender. Los márgenes los pone el dueño; acá solo se consulta.
        </p>
      </div>
      <div className="border-t border-border px-5 pb-5 pt-4">
        <PriceCalc />
      </div>
    </section>
  );
}

function PriceCalc() {
  const products = useImanStore((s) => s.products);
  const categories = useImanStore((s) => s.categories);
  const settings = useImanStore((s) => s.settings);

  const [modo, setModo] = useState<"producto" | "costo">("producto");
  const [productId, setProductId] = useState("");
  const [q, setQ] = useState("");
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
  const encontrados = useMemo(() => lista.filter((p) => productMatchesQuery(p, q)), [lista, q]);
  const MUESTRA = 40;
  const sobran = Math.max(0, encontrados.length - MUESTRA);
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
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex shrink-0 flex-col gap-1.5">
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
        <div className="min-w-[17rem] flex-1">
          <Label>Producto</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o código"
              className="pl-10"
            />
          </div>
          {encontrados.length === 0 ? (
            <p className="mt-2 px-1 text-sm text-muted">No hay productos con esa búsqueda.</p>
          ) : (
            <ScrollArea className="mt-2 max-h-[11rem]">
              <ul className="flex flex-col gap-0.5">
                {encontrados.slice(0, MUESTRA).map((x) => {
                  const c = unitCost(x);
                  const elegido = x.id === productId;
                  return (
                    <li key={x.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                          elegido ? "bg-accent text-accent-fg" : "hover:bg-elevated",
                        )}
                        onClick={() => setProductId(x.id)}
                      >
                        <span className="truncate">{x.name}</span>
                        <span className={cn("num shrink-0 text-xs", elegido ? "" : "text-muted")}>
                          {c == null ? "sin costo" : formatARS(c)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
          {sobran ? (
            <p className="mt-1 px-1 text-xs text-subtle">
              Hay <span className="num">{sobran}</span> más. Afiná la búsqueda.
            </p>
          ) : null}
          {producto ? (
            <p className="mt-2 px-1 text-sm text-muted">
              {rubro?.name || "Sin rubro"} ·{" "}
              {cost == null ? "sin costo cargado" : <>costo <span className="num">{formatARS(cost)}</span></>}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid min-w-[17rem] flex-1 grid-cols-2 gap-3">
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

      <div className="grid min-w-[19rem] flex-1 grid-cols-2 gap-2">
        {(["X", "A"] as InvoiceKind[]).map((kind) => {
          const r = sugerido(kind);
          return (
            <div key={kind} className="rounded-lg bg-elevated p-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
                Fac {kind}
              </span>
              <p className="num mt-1 text-2xl font-medium leading-none">{r ? formatARS(r.precio) : "—"}</p>
              <p className="mt-1.5 text-xs leading-snug text-muted">
                {r && cost != null
                  ? `costo ${formatARS(cost)} × ${verFactor(r.factor)}, ${redondeo}`
                  : modo === "producto"
                    ? producto
                      ? "Este producto no tiene costo cargado"
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
