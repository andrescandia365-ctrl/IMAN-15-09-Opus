import { useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatARS, todayKey } from "@/lib/format";
import { productMatchesQuery } from "@/lib/pack";
import { unitCost } from "@/lib/pricing";
import { PROMO_NOMBRE, vigente } from "@/lib/promos";
import { useImanStore } from "@/lib/store";
import type { Product, Promo, PromoKind } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

const TIPOS: PromoKind[] = ["oferta", "liquidacion", "2x1", "combo"];

/** "2026-09-30" → "30/09". */
function diaMes(d: string): string {
  const [, m, dd] = d.split("-");
  return `${dd}/${m}`;
}

/**
 * Las promos que cobra la caja. Está en Dueño: bajar un precio pide el PIN.
 * El precio lo pone el kiosquero a mano; al lado, el costo como recordatorio.
 */
export function OwnerPromos() {
  const promos = useImanStore((s) => s.promos);
  const products = useImanStore((s) => s.products);
  const savePromo = useImanStore((s) => s.savePromo);
  const [nueva, setNueva] = useState(false);
  const [terminando, setTerminando] = useState<string | null>(null);
  const hoy = todayKey();

  const nombreDe = (id: string) => products.find((p) => p.id === id)?.name ?? "(producto borrado)";
  const vigentes = promos.filter((p) => vigente(p, hoy));
  const proximas = promos.filter((p) => !p.endedAt && p.from > hoy);
  const terminadas = promos.filter((p) => p.endedAt || p.until < hoy).slice(0, 10);

  function terminar(p: Promo) {
    savePromo({ ...p, endedAt: new Date().toISOString() });
    setTerminando(null);
    toast.success("Promo terminada. La caja vuelve al precio de góndola.");
  }

  const fila = (p: Promo, puedeTerminar: boolean) => (
    <li key={p.id} className="rounded-lg bg-elevated px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            <span className="mr-1.5 text-danger">{PROMO_NOMBRE[p.kind]}</span>
            {p.name}
          </p>
          <p className="text-xs text-muted">
            {p.items.map((it) => `${it.qty > 1 ? `${it.qty} × ` : ""}${nombreDe(it.productId)}`).join(" + ")}
          </p>
          <p className="num mt-0.5 text-xs text-subtle">
            {formatARS(p.price)}
            {p.kind === "oferta" || p.kind === "liquidacion" ? " c/u" : ""} · del {diaMes(p.from)} al {diaMes(p.until)}
            {p.hastaAgotarStock ? " · hasta agotar stock" : ""}
            {p.endedAt ? " · terminada" : ""}
          </p>
        </div>
        {puedeTerminar ? (
          terminando === p.id ? (
            <div className="flex gap-1.5">
              <Button size="sm" variant="danger" onClick={() => terminar(p)}>
                Terminar ya
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setTerminando(null)}>
                No
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setTerminando(p.id)}>
              Terminar
            </Button>
          )
        ) : null}
      </div>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Lo que dice el cartel lo cobra la caja, hasta la fecha de fin.</p>
        {nueva ? null : <Button onClick={() => setNueva(true)}>Nueva promo</Button>}
      </div>
      {nueva ? <NuevaPromo products={products} onListo={() => setNueva(false)} /> : null}
      <section>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Vigentes</p>
        {vigentes.length ? (
          <ul className="mt-2 space-y-1.5">{vigentes.map((p) => fila(p, true))}</ul>
        ) : (
          <p className="mt-2 text-sm text-subtle">No hay promos vigentes.</p>
        )}
      </section>
      {proximas.length ? (
        <section>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Empiezan más adelante</p>
          <ul className="mt-2 space-y-1.5">{proximas.map((p) => fila(p, true))}</ul>
        </section>
      ) : null}
      {terminadas.length ? (
        <section>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Terminadas</p>
          <ul className="mt-2 space-y-1.5 opacity-80">{terminadas.map((p) => fila(p, false))}</ul>
        </section>
      ) : null}
    </div>
  );
}

function NuevaPromo({ products, onListo }: { products: Product[]; onListo: () => void }) {
  const savePromo = useImanStore((s) => s.savePromo);
  const hoy = todayKey();
  const [kind, setKind] = useState<PromoKind>("oferta");
  const [items, setItems] = useState<{ productId: string; qty: number }[]>([]);
  const [q, setQ] = useState("");
  const [precio, setPrecio] = useState("");
  const [nombre, setNombre] = useState("");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState("");
  const [agotar, setAgotar] = useState(false);

  const uno = kind !== "combo";
  const qtyFija = kind === "2x1" ? 2 : 1;
  const resultados = useMemo(
    () =>
      q.trim()
        ? products
            .filter((p) => p.active && productMatchesQuery(p, q) && !items.some((it) => it.productId === p.id))
            .slice(0, 8)
        : [],
    [products, q, items],
  );
  const elegidos = items.map((it) => ({ ...it, p: products.find((p) => p.id === it.productId) }));
  // El costo, como recordatorio y nada más: sin cuenta de precio mínimo.
  const costos = elegidos.map((e) => (e.p ? unitCost(e.p) : null));
  const costo = elegidos.length && costos.every((c) => c != null)
    ? elegidos.reduce((a, e, i) => a + (costos[i] ?? 0) * e.qty, 0)
    : null;

  function elegir(p: Product) {
    setItems((cur) => (uno ? [{ productId: p.id, qty: qtyFija }] : [...cur, { productId: p.id, qty: 1 }]));
    if (!nombre.trim() && uno) setNombre(p.name);
    setQ("");
  }

  function cambiarTipo(k: PromoKind) {
    setKind(k);
    setItems((cur) => (k === "combo" ? cur : cur.slice(0, 1).map((it) => ({ ...it, qty: k === "2x1" ? 2 : 1 }))));
  }

  function guardar() {
    const price = Number(precio.replace(",", "."));
    if (!items.length) return toast.error(uno ? "Elegí el producto" : "Elegí los productos del combo");
    if (kind === "combo" && items.length < 2 && items[0]!.qty < 2) return toast.error("Un combo lleva más de un producto");
    if (!Number.isFinite(price) || price <= 0) return toast.error("Poné el precio de la promo");
    if (!hasta) return toast.error("Poné hasta qué día vale");
    if (hasta < desde) return toast.error("La fecha de fin es antes que la de inicio");
    const ahora = new Date().toISOString();
    savePromo({
      id: uid("pr"),
      kind,
      name: nombre.trim() || (uno ? (elegidos[0]?.p?.name ?? PROMO_NOMBRE[kind]) : "Combo"),
      items,
      price,
      from: desde,
      until: hasta,
      ...(agotar ? { hastaAgotarStock: true } : {}),
      createdAt: ahora,
      updatedAt: ahora,
    });
    toast.success("Promo guardada. La caja la cobra desde el día de inicio.");
    onListo();
  }

  return (
    <div className="rounded-xl bg-bg p-4 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de promo">
        {TIPOS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => cambiarTipo(k)}
            className={cn(
              "h-10 rounded-full px-4 text-sm font-medium",
              kind === k ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
            )}
          >
            {PROMO_NOMBRE[k]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <Label htmlFor="promo-buscar">{uno ? "Producto" : "Productos del combo"}</Label>
        {elegidos.length ? (
          <ul className="mt-1.5 space-y-1">
            {elegidos.map((e) => (
              <li key={e.productId} className="flex items-center gap-2 rounded-md bg-elevated px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{e.p?.name}</span>
                <span className="num text-xs text-subtle">{e.p ? formatARS(e.p.price) : ""}</span>
                {kind === "combo" ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Menos"
                      className="grid size-8 place-items-center rounded-sm"
                      onClick={() =>
                        setItems((cur) =>
                          cur.map((it) => (it.productId === e.productId ? { ...it, qty: Math.max(1, it.qty - 1) } : it)),
                        )
                      }
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="num w-4 text-center">{e.qty}</span>
                    <button
                      type="button"
                      aria-label="Más"
                      className="grid size-8 place-items-center rounded-sm"
                      onClick={() =>
                        setItems((cur) => cur.map((it) => (it.productId === e.productId ? { ...it, qty: it.qty + 1 } : it)))
                      }
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </span>
                ) : kind === "2x1" ? (
                  <span className="text-xs text-muted">lleva 2</span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Sacar ${e.p?.name ?? ""}`}
                  className="grid size-8 place-items-center text-muted"
                  onClick={() => setItems((cur) => cur.filter((it) => it.productId !== e.productId))}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {uno && items.length ? null : (
          <>
            <Input
              id="promo-buscar"
              className="mt-1.5"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre o código"
              autoComplete="off"
            />
            {resultados.length ? (
              <ul className="mt-1 max-h-48 overflow-y-auto rounded-md bg-elevated p-1">
                {resultados.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-surface"
                      onClick={() => elegir(p)}
                    >
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="num shrink-0 text-xs text-subtle">{formatARS(p.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="promo-precio">
            {kind === "combo" ? "Precio del combo" : kind === "2x1" ? "Precio por los 2" : "Precio de la promo, por unidad"}
          </Label>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              id="promo-precio"
              inputMode="decimal"
              value={precio}
              onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="$"
              className="w-32"
            />
            {costo != null ? <span className="num text-xs text-subtle">Costo {formatARS(costo)}</span> : null}
          </div>
        </div>
        <div>
          <Label htmlFor="promo-nombre">Nombre en el ticket</Label>
          <Input
            id="promo-nombre"
            className="mt-1.5"
            value={nombre}
            onChange={(e) => setNombre(e.target.value.slice(0, 40))}
            placeholder={kind === "combo" ? "Combo merienda" : "Alfajor Havanna"}
          />
        </div>
        <div>
          <Label htmlFor="promo-desde">Desde</Label>
          <Input id="promo-desde" type="date" className="mt-1.5" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="promo-hasta">Hasta (incluido)</Label>
          <Input
            id="promo-hasta"
            type="date"
            className="mt-1.5"
            value={hasta}
            min={desde}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={agotar} onChange={(e) => setAgotar(e.target.checked)} />
        Hasta agotar stock
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onListo}>
          Cancelar
        </Button>
        <Button onClick={guardar}>Guardar promo</Button>
      </div>
    </div>
  );
}
