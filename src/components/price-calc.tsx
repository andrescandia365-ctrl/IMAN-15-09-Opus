import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Lock, Maximize2, Minimize2, Search, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatARS, formatMiles } from "@/lib/format";
import { findByScan, packOf, productMatchesQuery } from "@/lib/pack";
import {
  factorFor,
  hasFactor,
  invoiceForProduct,
  isBigPriceJump,
  quotedPrice,
  shelfInvoice,
  unitCost,
  type InvoiceKind,
} from "@/lib/pricing";
import {
  BOLETA_A,
  BOLETA_X,
  POR_UNIDAD,
  QUE_NUMERO,
  avisosDeCosto,
  porUnidad,
  recordatorioBulto,
  recordatorioCosto,
  recordatorioEscaneoBulto,
} from "@/lib/costo-guia";
import { useImanStore } from "@/lib/store";
import type { Category, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

/** El multiplicador se lee "1,5", no "1.5". */
function verFactor(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

type Valores = { cost: number | null; price: number; priceUpdatedAt: string };
type Hecho = { id: string; name: string; antes: Valores; despues: Valores };

/**
 * Lo actualizado en esta sesión, por local. Vive fuera de la tarjeta para que
 * no se pierda al ir a Inventario y volver; se va al recargar la página.
 */
const memorias = new Map<string, Hecho[]>();
const TOPE = 10;
const MUESTRA = 8;
/** Un costo con esta cantidad de dígitos que es un código es un escaneo que cayó en el costo. */
const LARGO_CODIGO = 8;

/**
 * Carga rápida de costos con el lector, mientras se guarda un pedido. El
 * encargado pone el costo por unidad; el precio sale del margen del rubro y el
 * redondeo, que se siguen tocando solo en el panel del dueño.
 */
export function PriceUpdateCard() {
  const storeId = useImanStore((s) => s.deskStoreId);
  return <PriceUpdate key={storeId} storeId={storeId} />;
}

function PriceUpdate({ storeId }: { storeId: string }) {
  const products = useImanStore((s) => s.products);
  const categories = useImanStore((s) => s.categories);
  const suppliers = useImanStore((s) => s.suppliers);
  const settings = useImanStore((s) => s.settings);
  const saveProduct = useImanStore((s) => s.saveProduct);

  const [full, setFull] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState<{ id: string; kind: "unit" | "pack" } | null>(null);
  const [costo, setCosto] = useState("");
  const [costoInicial, setCostoInicial] = useState("");
  const [bulto, setBulto] = useState("");
  const [ejemplo, setEjemplo] = useState<InvoiceKind | null>(null);
  const [confirmar, setConfirmar] = useState<{
    cost: number;
    price: number;
    avisos: string[];
    salto: boolean;
  } | null>(null);
  const [hechos, setHechos] = useState<Hecho[]>(() => memorias.get(storeId) ?? []);

  const buscador = useRef<HTMLInputElement>(null);
  const costoRef = useRef<HTMLInputElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const avisoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    memorias.set(storeId, hechos);
  }, [storeId, hechos]);

  const step = settings.roundStep && settings.roundStep > 0 ? settings.roundStep : 100;
  const mode = settings.roundMode === "down" ? "down" : "up";
  const redondeo = `redondeo ${formatMiles(step)} ${mode === "down" ? "abajo" : "arriba"}`;

  const activos = useMemo(
    () => products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [products],
  );
  const encontrados = useMemo(
    () => (q.trim() ? activos.filter((p) => productMatchesQuery(p, q)) : []),
    [activos, q],
  );
  const sobran = Math.max(0, encontrados.length - MUESTRA);

  const producto = sel ? (products.find((p) => p.id === sel.id) ?? null) : null;
  const rubro: Category | null = producto
    ? (categories.find((c) => c.id === producto.categoryId) ?? { id: producto.categoryId, name: "", sort: 0 })
    : null;
  const fac: InvoiceKind = producto ? shelfInvoice(producto, suppliers) : "X";
  // Para el recordatorio: sin proveedor con factura que traiga el rubro no se sabe qué renglón es.
  const facProveedor = producto ? (invoiceForProduct(producto, suppliers)?.invoice ?? null) : null;
  const pack = producto ? packOf(producto) : 1;
  const sinMargen = rubro ? !hasFactor(rubro, fac, settings) : false;
  const tocado = costo !== costoInicial;
  const costoNuevo = producto ? (tocado ? Number(costo) || null : unitCost(producto)) : null;

  function calculo(kind: InvoiceKind): { factor: number; precio: number } | null {
    if (!producto || !rubro || costoNuevo == null) return null;
    const factor = factorFor(rubro, kind, settings);
    const precio = quotedPrice({ ...producto, cost: costoNuevo }, factor, step, mode);
    return precio == null ? null : { factor, precio };
  }
  const precioNuevo = sinMargen ? null : (calculo(fac)?.precio ?? null);

  const alBuscador = useCallback(() => {
    buscador.current?.focus({ preventScroll: true });
  }, []);

  const volverAlBuscador = useCallback(() => {
    setSel(null);
    setQ("");
    setCursor(0);
    setCosto("");
    setCostoInicial("");
    setBulto("");
    setConfirmar(null);
    alBuscador();
  }, [alBuscador]);

  /** Al entrar o salir de pantalla completa el foco vuelve a donde se estaba cargando. */
  const pantallaCompleta = useCallback(
    (v: boolean) => {
      setFull(v);
      if (sel) costoRef.current?.focus({ preventScroll: true });
      else alBuscador();
    },
    [sel, alBuscador],
  );

  // Al abrir, el buscador queda listo para el lector sin mover la pantalla.
  useEffect(() => {
    alBuscador();
  }, [alBuscador]);

  // El cálculo y el aviso tienen que quedar a la vista: la tarjeta está al pie de Caja.
  useEffect(() => {
    if (!sel) return;
    costoRef.current?.focus({ preventScroll: true });
    costoRef.current?.select();
    editorRef.current?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  useEffect(() => {
    if (!confirmar) return;
    confirmarRef.current?.focus({ preventScroll: true });
    avisoRef.current?.scrollIntoView({ block: "nearest" });
  }, [confirmar]);

  useEffect(() => {
    if (!full) return;
    function onKey(e: globalThis.KeyboardEvent) {
      // El aviso de precio usa Escape para cancelar y lo marca como usado.
      if (e.key !== "Escape" || e.defaultPrevented) return;
      pantallaCompleta(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [full, pantallaCompleta]);

  function elegir(p: Product, kind: "unit" | "pack") {
    const inicial = p.cost != null && p.cost > 0 ? String(Math.round(p.cost)) : "";
    setSel({ id: p.id, kind });
    setCosto(inicial);
    setCostoInicial(inicial);
    setBulto("");
    setConfirmar(null);
    setQ("");
    setCursor(0);
  }

  function onBuscadorKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.max(0, Math.min(c + 1, Math.min(encontrados.length, MUESTRA) - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const raw = q.trim();
    if (!raw) return;
    const hit = findByScan(products, raw);
    if (hit) {
      elegir(hit.product, hit.kind);
      return;
    }
    const p = encontrados[cursor] ?? encontrados[0];
    if (p) elegir(p, "unit");
    else toast.error(`No está: ${raw}`);
  }

  function anotar(h: Hecho) {
    setHechos((prev) => {
      // Un producto aparece una vez: si se toca de nuevo, Deshacer vuelve a como estaba al empezar.
      const previo = prev.find((x) => x.id === h.id);
      const junto = previo ? { ...h, antes: previo.antes } : h;
      const resto = prev.filter((x) => x.id !== h.id);
      const volvio = junto.antes.cost === junto.despues.cost && junto.antes.price === junto.despues.price;
      return (volvio ? resto : [junto, ...resto]).slice(0, TOPE);
    });
  }

  function aplicar(p: Product, cost: number, price: number) {
    const antes: Valores = { cost: p.cost, price: p.price, priceUpdatedAt: p.priceUpdatedAt };
    const despues: Valores = {
      cost,
      price,
      priceUpdatedAt: price === p.price ? p.priceUpdatedAt : new Date().toISOString(),
    };
    saveProduct({ ...p, ...despues });
    anotar({ id: p.id, name: p.name, antes, despues });
    toast.success(`${p.name} · ${formatARS(price)}`);
    volverAlBuscador();
  }

  function sinCambios() {
    if (producto) toast(`Sin cambios · ${producto.name}`);
    volverAlBuscador();
  }

  function guardar() {
    if (!producto || !rubro) return;
    // Si se escaneó el próximo sin dar Enter, el código cayó en el costo.
    const scan =
      (tocado && costo.length >= LARGO_CODIGO ? findByScan(products, costo) : null) ??
      (bulto.length >= LARGO_CODIGO ? findByScan(products, bulto) : null);
    if (scan) {
      toast(`Eso era un código: ${scan.product.name}`);
      elegir(scan.product, scan.kind);
      return;
    }
    if (costoNuevo == null) {
      toast.error("Poné el costo por unidad");
      return;
    }
    if (sinMargen || precioNuevo == null) {
      toast.error("Este rubro no tiene margen. Lo pone el dueño.");
      return;
    }
    if (!tocado && precioNuevo === producto.price) {
      sinCambios();
      return;
    }
    // Solo se sospecha de un número que cargó el encargado.
    const avisos = tocado
      ? avisosDeCosto({
          costo: costoNuevo,
          costoAntes: unitCost(producto),
          precioNuevo,
          bulto: pack,
          desdeBulto: bulto !== "",
        })
      : [];
    const salto = isBigPriceJump(producto.price, precioNuevo);
    if (avisos.length || salto) {
      setConfirmar({ cost: costoNuevo, price: precioNuevo, avisos, salto });
      return;
    }
    aplicar(producto, costoNuevo, precioNuevo);
  }

  function cancelarConfirmar() {
    setConfirmar(null);
    costoRef.current?.focus({ preventScroll: true });
    costoRef.current?.select();
  }

  function deshacer(h: Hecho) {
    setHechos((prev) => prev.filter((x) => x.id !== h.id));
    const p = products.find((x) => x.id === h.id);
    if (!p) {
      toast.error("Ese producto ya no está");
      return;
    }
    saveProduct({ ...p, ...h.antes });
    toast.success(`${p.name} vuelve a ${formatARS(h.antes.price)}`);
    if (sel?.id === h.id) volverAlBuscador();
  }

  return (
    <section
      className={cn(
        "rounded-xl bg-surface shadow-[var(--shadow-border)]",
        full && "fixed inset-0 z-50 overflow-y-auto rounded-none p-3",
      )}
    >
      <div className="flex items-start gap-2 px-5 py-4">
        <div className="min-w-0 flex-1">
          <span className="block text-xs font-medium uppercase tracking-[0.14em] text-subtle">Herramienta</span>
          <span className="mt-0.5 block font-display text-xl tracking-tight">Actualizar precios</span>
          <p className="mt-1 text-xs leading-snug text-muted">
            Escaneá, poné el costo por unidad y Enter. El precio sale del margen del rubro, que pone el dueño.
          </p>
        </div>
        {full ? (
          <Button
            size="sm"
            variant="secondary"
            aria-label="Salir de pantalla completa"
            onClick={() => pantallaCompleta(false)}
          >
            <Minimize2 className="size-4" />
            Salir
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => pantallaCompleta(true)}>
            <Maximize2 className="size-4" />
            Pantalla completa
          </Button>
        )}
      </div>

      <div className="grid gap-5 border-t border-border px-5 pb-5 pt-4 md:grid-cols-[minmax(16rem,1fr)_minmax(20rem,1.4fr)]">
        <div className="min-w-0">
          <Label>Producto</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              ref={buscador}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onBuscadorKey}
              placeholder="Escaneá o escribí · Enter elige"
              className="pl-10"
              autoComplete="off"
            />
          </div>
          {q.trim() ? (
            encontrados.length === 0 ? (
              <p className="mt-2 px-1 text-sm text-muted">No hay productos con esa búsqueda.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-0.5">
                {encontrados.slice(0, MUESTRA).map((x, i) => {
                  const c = unitCost(x);
                  const marcado = i === cursor;
                  return (
                    <li key={x.id}>
                      <button
                        type="button"
                        tabIndex={-1}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                          marcado ? "bg-accent text-accent-fg" : "hover:bg-elevated",
                        )}
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => elegir(x, "unit")}
                      >
                        <span className="truncate">{x.name}</span>
                        <span className={cn("num shrink-0 text-xs", marcado ? "" : "text-muted")}>
                          {c == null ? "sin costo" : `costo ${formatARS(c)}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}
          {q.trim() && sobran ? (
            <p className="mt-1 px-1 text-xs text-subtle">
              Hay <span className="num">{sobran}</span> más. Afiná la búsqueda.
            </p>
          ) : null}
        </div>

        {producto && rubro ? (
          <div ref={editorRef} className="flex min-w-0 scroll-mb-4 flex-col gap-3">
            <div>
              <p className="truncate text-base font-medium">{producto.name}</p>
              <p className="text-xs text-muted">
                {rubro.name || "Sin rubro"} · a góndola va Fac {fac}
              </p>
            </div>

            {sel?.kind === "pack" ? (
              <p className="rounded-lg bg-warn/15 px-3 py-2 text-sm">{recordatorioEscaneoBulto(pack)}</p>
            ) : null}

            {/* Siempre a la vista: qué renglón de la boleta va, según la factura del proveedor del rubro. */}
            <div className="rounded-lg bg-elevated px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm leading-snug">{recordatorioCosto(facProveedor)}</p>
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted underline underline-offset-2 hover:text-fg"
                  onClick={() => setEjemplo(facProveedor ?? fac)}
                >
                  {QUE_NUMERO}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted">{POR_UNIDAD}</p>
              {pack > 1 ? <p className="text-xs text-muted">{recordatorioBulto(pack)}</p> : null}
            </div>

            <div
              className={cn(
                "grid gap-3",
                pack > 1 ? "grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-2",
              )}
            >
              {pack > 1 ? (
                <div>
                  <Label>Costo del bulto</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="opcional"
                    aria-label={`Costo del bulto de ${pack}`}
                    value={bulto}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setBulto(v);
                      // La calculadora llena el costo por unidad; si se borra, vuelve el de antes.
                      setCosto(v ? String(porUnidad(Number(v), pack)) : costoInicial);
                      setConfirmar(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      guardar();
                    }}
                    autoComplete="off"
                  />
                </div>
              ) : null}
              <div>
                <Label>Costo por unidad</Label>
                <Input
                  ref={costoRef}
                  inputMode="numeric"
                  placeholder="0"
                  value={costo}
                  onChange={(e) => {
                    setCosto(e.target.value.replace(/[^\d]/g, ""));
                    // Escribir la unidad a mano deja la calculadora de bulto de lado.
                    setBulto("");
                    setConfirmar(null);
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    guardar();
                  }}
                  autoComplete="off"
                />
                {bulto ? (
                  <p className="num mt-1 text-[11px] text-muted">
                    {formatARS(Number(bulto))} ÷ {pack} = {formatARS(porUnidad(Number(bulto), pack))}
                  </p>
                ) : null}
              </div>
              <div>
                <Label>Precio de venta</Label>
                <div
                  className="flex h-11 items-center gap-2 rounded-md bg-bg px-3.5 text-muted shadow-[var(--shadow-border)]"
                  aria-readonly="true"
                >
                  <Lock className="size-4 shrink-0" />
                  <span className="num text-[15px] text-fg">
                    {precioNuevo == null ? "—" : formatARS(precioNuevo)}
                  </span>
                  {producto.price > 0 && precioNuevo != null && precioNuevo !== producto.price ? (
                    <span className="num truncate text-xs">antes {formatARS(producto.price)}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-subtle">Sale del costo. No se escribe a mano.</p>
              </div>
            </div>

            {sinMargen ? (
              <p className="rounded-lg bg-warn/15 px-3 py-2 text-sm">
                {rubro.name ? `${rubro.name} no tiene margen cargado.` : "Este producto no tiene rubro."} Pedile al
                dueño que lo ponga.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(["X", "A"] as InvoiceKind[]).map((kind) => {
                  const r = calculo(kind);
                  return (
                    <div
                      key={kind}
                      className={cn(
                        "rounded-lg bg-elevated p-3",
                        kind === fac && "shadow-[0_0_0_2px_var(--iman-accent)]",
                      )}
                    >
                      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
                        Fac {kind}
                        {kind === fac ? " · góndola" : ""}
                      </span>
                      <p className="num mt-1 text-2xl font-medium leading-none">{r ? formatARS(r.precio) : "—"}</p>
                      <p className="mt-1.5 text-xs leading-snug text-muted">
                        {r && costoNuevo != null
                          ? `costo ${formatARS(costoNuevo)} × ${verFactor(r.factor)}, ${redondeo}`
                          : "Poné el costo"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {confirmar ? (
              <div
                ref={avisoRef}
                role="alertdialog"
                aria-label="Confirmar cambio de precio"
                className="rounded-lg bg-warn/15 p-3"
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  e.preventDefault();
                  cancelarConfirmar();
                }}
              >
                {confirmar.avisos.map((a) => (
                  <p key={a} className="mb-1 text-sm font-medium">
                    {a}
                  </p>
                ))}
                <p className="text-sm">
                  El precio pasa de <span className="num">{formatARS(producto.price)}</span> a{" "}
                  <span className="num">{formatARS(confirmar.price)}</span>.
                  {confirmar.avisos.length ? "" : " ¿Seguro?"}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button ref={confirmarRef} size="sm" onClick={() => aplicar(producto, confirmar.cost, confirmar.price)}>
                    Confirmar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={cancelarConfirmar}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button onClick={guardar} disabled={sinMargen}>
                  Guardar · Enter
                </Button>
                <Button variant="secondary" onClick={sinCambios}>
                  Sin cambios
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="self-center text-sm text-muted">
            Escaneá un producto o buscalo por nombre. El costo se carga por unidad.
          </p>
        )}
      </div>

      {hechos.length ? (
        <div className="border-t border-border px-5 pb-5 pt-4">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Actualizados recién</h3>
          <ul className="mt-2 flex flex-col gap-1">
            {hechos.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 rounded-md bg-bg px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{h.name}</p>
                  <p className="num text-xs text-muted">
                    costo {h.antes.cost == null ? "sin cargar" : formatARS(h.antes.cost)} →{" "}
                    {h.despues.cost == null ? "sin cargar" : formatARS(h.despues.cost)} · precio{" "}
                    {formatARS(h.despues.price)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deshacer(h)}>
                  <Undo2 className="size-4" />
                  Deshacer
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog open={ejemplo != null} onOpenChange={(v) => !v && setEjemplo(null)}>
        <DialogContent
          // Al cerrar vuelve al costo, con lo que ya estaba cargado.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            costoRef.current?.focus({ preventScroll: true });
          }}
        >
          <DialogHeader>
            <DialogTitle>Qué número copiar de la boleta</DialogTitle>
            <DialogDescription>Una boleta de ejemplo. El renglón resaltado es el que va en el costo.</DialogDescription>
          </DialogHeader>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["A", "X"] as InvoiceKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={cn(
                  "h-10 rounded-md text-sm font-medium",
                  ejemplo === k ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
                )}
                onClick={() => setEjemplo(k)}
              >
                Factura {k}
              </button>
            ))}
          </div>
          {ejemplo === "A" ? (
            <BoletaEjemplo
              titulo="Factura A"
              renglones={[
                ["Cantidad", `${BOLETA_A.unidades} unidades`],
                ["Neto", formatARS(BOLETA_A.neto)],
                ["Impuestos internos", formatARS(BOLETA_A.internos)],
                ["Subtotal", formatARS(BOLETA_A.subtotal), true],
                ["IVA 21%", formatARS(BOLETA_A.iva)],
                ["TOTAL", formatARS(BOLETA_A.total)],
              ]}
              cuenta={`Costo por unidad = ${formatARS(BOLETA_A.subtotal)} ÷ ${BOLETA_A.unidades} = ${formatARS(porUnidad(BOLETA_A.subtotal, BOLETA_A.unidades))}`}
              nota="Ojo: los impuestos internos SÍ van. El IVA NO."
            />
          ) : (
            <BoletaEjemplo
              titulo="Factura X"
              renglones={[
                ["Cantidad", `${BOLETA_X.unidades} unidades`],
                ["TOTAL", formatARS(BOLETA_X.total), true],
              ]}
              cuenta={`Costo por unidad = ${formatARS(BOLETA_X.total)} ÷ ${BOLETA_X.unidades} = ${formatARS(porUnidad(BOLETA_X.total, BOLETA_X.unidades))}`}
              nota="Acá va todo lo que pagaste. No se descuenta nada."
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Una boleta de mentira: el renglón que se copia, resaltado; el resto, en gris. */
function BoletaEjemplo({
  titulo,
  renglones,
  cuenta,
  nota,
}: {
  titulo: string;
  renglones: [string, string, boolean?][];
  cuenta: string;
  nota: string;
}) {
  return (
    <div className="mt-3">
      <div className="ticket-grain rounded-lg bg-paper px-4 py-3 text-ink shadow-[var(--shadow-ticket)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">Boleta de ejemplo · {titulo}</p>
        <ul className="mt-2 flex flex-col gap-0.5">
          {renglones.map(([nombre, valor, este]) => (
            <li
              key={nombre}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm",
                este ? "bg-dato font-semibold text-dato-fg" : "text-ink-muted",
              )}
            >
              <span>
                {nombre}
                {este ? <span className="ml-2 text-[11px] font-medium uppercase tracking-[0.08em]">← este</span> : null}
              </span>
              <span className="num">{valor}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="num mt-3 text-sm font-medium">{cuenta}</p>
      <p className="mt-1 text-sm text-muted">{nota}</p>
    </div>
  );
}
