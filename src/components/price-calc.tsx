import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Lock, Maximize2, Minimize2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  POR_UNIDAD,
  QUE_NUMERO,
  avisosDeCosto,
  porUnidad,
  recordatorioBulto,
  recordatorioCosto,
  recordatorioEscaneoBulto,
} from "@/lib/costo-guia";
import { BoletaCostoDialog } from "@/components/costo-boleta";
import { useImanStore } from "@/lib/store";
import type { Category, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

/** El multiplicador se lee "1,5", no "1.5". */
function verFactor(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

type Hecho = { id: string; categoryId: string };

/**
 * Lo actualizado en esta sesión, por local. Vive fuera de la tarjeta para que
 * no se pierda al ir a Inventario y volver; se va al recargar la página.
 * Solo alimenta el renglón "Van N de este rubro": no hay historial en pantalla.
 */
const memorias = new Map<string, Hecho[]>();
const MUESTRA = 8;
/** Un costo con esta cantidad de dígitos que es un código es un escaneo que cayó en el costo. */
const LARGO_CODIGO = 8;

/**
 * Carga rápida de costos con el lector, mientras se guarda un pedido. Si
 * viene en bulto, el cursor va al costo del bulto. El precio sale del margen
 * del rubro, que se sigue tocando solo en el panel del dueño.
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
  const bultoRef = useRef<HTMLInputElement>(null);
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

  const enfocarCosto = useCallback((enBulto: boolean) => {
    const el = enBulto ? bultoRef.current : costoRef.current;
    el?.focus({ preventScroll: true });
    el?.select();
  }, []);

  /** Al entrar o salir de pantalla completa el foco vuelve a donde se estaba cargando. */
  const pantallaCompleta = useCallback(
    (v: boolean) => {
      setFull(v);
      if (sel) enfocarCosto(pack > 1);
      else alBuscador();
    },
    [sel, pack, alBuscador, enfocarCosto],
  );

  // Al abrir, el buscador queda listo para el lector sin mover la pantalla.
  useEffect(() => {
    alBuscador();
  }, [alBuscador]);

  // El cálculo y el aviso tienen que quedar a la vista: la tarjeta está al pie de Caja.
  // Si viene en bulto, el cursor va al costo del bulto — no al de unidad.
  useEffect(() => {
    if (!sel) return;
    enfocarCosto(pack > 1);
    editorRef.current?.scrollIntoView({ block: "nearest" });
  }, [sel, pack, enfocarCosto]);

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

  function anotar(p: Product) {
    setHechos((prev) => {
      const resto = prev.filter((x) => x.id !== p.id);
      return [{ id: p.id, categoryId: p.categoryId }, ...resto];
    });
  }

  function aplicar(p: Product, cost: number, price: number) {
    saveProduct({
      ...p,
      cost,
      price,
      priceUpdatedAt: price === p.price ? p.priceUpdatedAt : new Date().toISOString(),
    });
    anotar(p);
    toast.success(`${p.name} · ${formatARS(price)}`);
    volverAlBuscador();
  }

  function sinCambios() {
    if (producto) toast(`Sin cambios · ${producto.name}`);
    volverAlBuscador();
  }

  function guardar() {
    if (!producto || !rubro) return;
    // Si se escaneó el próximo sin dar Enter, el código cayó en el costo (o en el bulto).
    const scan =
      (bulto.length >= LARGO_CODIGO ? findByScan(products, bulto) : null) ??
      (tocado && costo.length >= LARGO_CODIGO ? findByScan(products, costo) : null);
    if (scan) {
      toast(`Eso era un código: ${scan.product.name}`);
      elegir(scan.product, scan.kind);
      return;
    }
    const desdeBulto = pack > 1 && bulto !== "";
    const escrito = desdeBulto || tocado;
    const costoFinal = desdeBulto
      ? Number(bulto) > 0
        ? porUnidad(Number(bulto), pack)
        : null
      : tocado
        ? Number(costo) || null
        : unitCost(producto);
    if (costoFinal == null) {
      toast.error(pack > 1 ? "Poné el costo del bulto" : "Poné el costo por unidad");
      return;
    }
    const precioFinal = sinMargen
      ? null
      : quotedPrice({ ...producto, cost: costoFinal }, factorFor(rubro, fac, settings), step, mode);
    if (sinMargen || precioFinal == null) {
      toast.error("Este rubro no tiene margen. Lo pone el dueño.");
      return;
    }
    if (!escrito && precioFinal === producto.price) {
      sinCambios();
      return;
    }
    // Solo se sospecha de un número que cargó el encargado.
    const avisos = escrito
      ? avisosDeCosto({
          costo: costoFinal,
          costoAntes: unitCost(producto),
          precioNuevo: precioFinal,
          bulto: pack,
          desdeBulto,
          precioHoy: producto.price,
        })
      : [];
    const salto = isBigPriceJump(producto.price, precioFinal);
    if (avisos.length || salto) {
      setConfirmar({ cost: costoFinal, price: precioFinal, avisos, salto });
      return;
    }
    aplicar(producto, costoFinal, precioFinal);
  }

  function cancelarConfirmar() {
    setConfirmar(null);
    enfocarCosto(pack > 1);
  }

  const lineaRonda = useMemo(() => {
    const categoryId = producto?.categoryId ?? hechos[0]?.categoryId;
    if (!categoryId) return null;
    const n = hechos.filter((h) => h.categoryId === categoryId).length;
    if (n <= 0) return null;
    const nombre = categories.find((c) => c.id === categoryId)?.name || "este rubro";
    return { n, nombre };
  }, [producto, hechos, categories]);

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
            Escaneá, poné el costo y Enter. El precio sale del margen del rubro, que pone el dueño.
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
            ) : pack > 1 ? (
              <p className="text-sm text-muted">{recordatorioBulto(pack)}</p>
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
              {pack <= 1 ? <p className="mt-1 text-xs text-muted">{POR_UNIDAD}</p> : null}
            </div>

            <div
              className={cn(
                "grid gap-3",
                pack > 1
                  ? "grid-cols-1 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]"
                  : "grid-cols-1 sm:grid-cols-2",
              )}
            >
              {pack > 1 ? (
                <div>
                  <Label>Costo del bulto</Label>
                  <Input
                    ref={bultoRef}
                    inputMode="numeric"
                    placeholder="del remito"
                    aria-label={`Costo del bulto de ${pack}`}
                    value={bulto}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setBulto(v);
                      // La calculadora llena el costo por unidad; si se borra, vuelve el de antes.
                      setCosto(v ? String(porUnidad(Number(v), pack)) : costoInicial);
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
                ) : pack > 1 ? (
                  <p className="mt-1 text-[11px] text-muted">{POR_UNIDAD}</p>
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
            Escaneá un producto o buscalo por nombre.
          </p>
        )}
      </div>

      {lineaRonda ? (
        <p className="border-t border-border px-5 py-3 text-sm text-muted">
          Van <span className="num font-medium text-fg">{lineaRonda.n}</span> de {lineaRonda.nombre} en esta ronda
        </p>
      ) : null}

      <BoletaCostoDialog
        openKind={ejemplo}
        onOpenKind={setEjemplo}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          enfocarCosto(pack > 1);
        }}
      />
    </section>
  );
}
