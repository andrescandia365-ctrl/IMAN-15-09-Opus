import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Printer, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { FotoProducto } from "@/components/foto-producto";
import { OwnerPinDialog } from "@/components/owner-pin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cargarFuentes, FUENTE_DEFAULT, FUENTES, fuentePorId } from "@/lib/cartel-fuentes";
import { compartirCartel, fotoDataUri, imprimirCartel, medidor } from "@/lib/cartel-salida";
import { cartelSvg, PALETAS, PLANTILLAS, type CartelDatos, type Plantilla } from "@/lib/carteles";
import { usePhoneUi } from "@/lib/device";
import { errorText } from "@/lib/errors";
import { formatARS, todayKey } from "@/lib/format";
import { isOwnerUnlocked } from "@/lib/owner-pin";
import { productMatchesQuery } from "@/lib/pack";
import { unitCost } from "@/lib/pricing";
import { PROMO_NOMBRE, vigente } from "@/lib/promos";
import { useImanStore } from "@/lib/store";
import type { Product, Promo, PromoKind } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

export type CartelPreset = { plantilla: Plantilla; productId?: string; n: number };

const ES_PROMO: Partial<Record<Plantilla, PromoKind>> = {
  oferta: "oferta",
  combo: "combo",
  "2x1": "2x1",
  liquidacion: "liquidacion",
};

function enDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return todayKey(d);
}

/**
 * El armador de carteles. Plantillas, no lienzo libre; el cartel sale del
 * catálogo (nombre y precio vienen solos). Las plantillas de promo no se
 * imprimen hasta que la promo está activa en la caja: lo que dice el cartel
 * lo cobra la caja. Activarla pide el PIN del dueño; los avisos no.
 */
export function CartelEditor({ preset }: { preset?: CartelPreset | null }) {
  const products = useImanStore((s) => s.products);
  const promos = useImanStore((s) => s.promos);
  const storeId = useImanStore((s) => s.deskStoreId);
  const local = useImanStore((s) => s.settings.name) || "Mi kiosco";
  const ciudad = useImanStore((s) => s.settings.city) || "";
  const pinHash = useImanStore((s) => s.settings.ownerPinHash);
  const savePromo = useImanStore((s) => s.savePromo);
  const celu = usePhoneUi();
  const hoy = todayKey();

  const [plantilla, setPlantilla] = useState<Plantilla>("oferta");
  const [items, setItems] = useState<{ productId: string; qty: number }[]>([]);
  const [q, setQ] = useState("");
  const [precio, setPrecio] = useState("");
  const [hasta, setHasta] = useState(enDias(7));
  const [agotar, setAgotar] = useState(false);
  const [titulo, setTitulo] = useState("Aviso");
  const [texto, setTexto] = useState("");
  const [paletaId, setPaletaId] = useState(PALETAS[0]!.id);
  const [ahorro, setAhorro] = useState(false);
  const [fuenteId, setFuenteId] = useState(FUENTE_DEFAULT);
  const [promoId, setPromoId] = useState<string | null>(null);
  const [fuentesListas, setFuentesListas] = useState(false);
  const [fotos, setFotos] = useState<Record<string, string | null>>({});
  const [pinOpen, setPinOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Las letras se cargan recién acá, al abrir el editor.
  useEffect(() => {
    let vivo = true;
    void cargarFuentes()
      .catch(() => undefined)
      .then(() => {
        if (vivo) setFuentesListas(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Desde una sugerencia: la plantilla que corresponde con el producto cargado.
  useEffect(() => {
    if (!preset) return;
    setPlantilla(preset.plantilla);
    setItems(preset.productId ? [{ productId: preset.productId, qty: preset.plantilla === "2x1" ? 2 : 1 }] : []);
    setPromoId(null);
    setPrecio("");
  }, [preset]);

  const kind = ES_PROMO[plantilla];
  const promo = promoId ? (promos.find((p) => p.id === promoId) ?? null) : null;
  // Con una promo elegida, el cartel dice exactamente lo que cobra la caja.
  const efectivos = promo ? promo.items : items;
  const elegidos = efectivos.map((it) => ({ ...it, p: products.find((p) => p.id === it.productId) }));
  const idsFotos = elegidos.map((e) => e.productId).join(",");

  useEffect(() => {
    let vivo = true;
    const ids = idsFotos ? idsFotos.split(",") : [];
    void Promise.all(ids.map(async (id) => [id, await fotoDataUri(storeId, id)] as const)).then((pares) => {
      if (vivo) setFotos(Object.fromEntries(pares));
    });
    const recargar = () => {
      void Promise.all(ids.map(async (id) => [id, await fotoDataUri(storeId, id)] as const)).then((pares) => {
        if (vivo) setFotos(Object.fromEntries(pares));
      });
    };
    window.addEventListener("iman-foto", recargar);
    return () => {
      vivo = false;
      window.removeEventListener("iman-foto", recargar);
    };
  }, [idsFotos, storeId]);

  const vigentesDelTipo = kind ? promos.filter((p) => p.kind === kind && vigente(p, hoy)) : [];
  const uno = plantilla !== "combo" && plantilla !== "aviso";
  const resultados = useMemo(
    () =>
      q.trim()
        ? products.filter((p) => p.active && productMatchesQuery(p, q) && !items.some((it) => it.productId === p.id)).slice(0, 8)
        : [],
    [products, q, items],
  );
  const costos = elegidos.map((e) => (e.p ? unitCost(e.p) : null));
  const costo = elegidos.length && costos.every((c) => c != null) ? elegidos.reduce((a, e, i) => a + (costos[i] ?? 0) * e.qty, 0) : null;

  const fuente = fuentePorId(fuenteId);
  const paleta = PALETAS.find((p) => p.id === paletaId) ?? PALETAS[0]!;
  const estilo = { paleta, ahorro, familia: fuente.familia };
  const precioNum = promo ? promo.price : Number(precio.replace(",", "."));
  const datos: CartelDatos = {
    plantilla,
    productos: elegidos.filter((e) => e.p).map((e) => ({ nombre: e.p!.name, precio: e.p!.price, foto: fotos[e.productId] ?? null, qty: e.qty })),
    precio: kind ? (Number.isFinite(precioNum) && precioNum > 0 ? precioNum : null) : null,
    hasta: kind ? (promo ? promo.until : hasta) : null,
    agotar: kind ? (promo ? Boolean(promo.hastaAgotarStock) : agotar) : false,
    titulo,
    texto,
  };
  const medir = useMemo(() => (fuentesListas ? medidor(fuente.familia) : (t: string, px: number) => t.length * px * 0.55), [fuentesListas, fuente.familia]);
  const vista = cartelSvg(datos, estilo, medir, { ancho: "100%", alto: "100%", idPre: "v" });

  const falta =
    plantilla === "aviso"
      ? !texto.trim()
        ? "Escribí el aviso"
        : null
      : !elegidos.length
        ? uno
          ? "Elegí el producto"
          : "Elegí los productos"
        : kind && !promo
          ? "Activá la promo en la caja para imprimir"
          : null;

  function elegir(p: Product) {
    setItems((cur) => (uno ? [{ productId: p.id, qty: plantilla === "2x1" ? 2 : 1 }] : [...cur, { productId: p.id, qty: 1 }]));
    setPromoId(null);
    setQ("");
  }

  function cambiarPlantilla(p: Plantilla) {
    setPlantilla(p);
    setPromoId(null);
    setItems((cur) => (p === "combo" ? cur : p === "aviso" ? [] : cur.slice(0, 1).map((it) => ({ ...it, qty: p === "2x1" ? 2 : 1 }))));
  }

  function activar() {
    if (!kind) return;
    if (!elegidos.length) return toast.error(uno ? "Elegí el producto" : "Elegí los productos del combo");
    if (kind === "combo" && items.length < 2 && (items[0]?.qty ?? 0) < 2) return toast.error("Un combo lleva más de un producto");
    if (!Number.isFinite(precioNum) || precioNum <= 0) return toast.error("Poné el precio de la promo");
    if (!hasta || hasta < hoy) return toast.error("Poné hasta qué día vale");
    // Bajar un precio lo decide el dueño.
    if (!isOwnerUnlocked()) {
      setPinOpen(true);
      return;
    }
    guardarPromo();
  }

  function guardarPromo() {
    if (!kind) return;
    const ahora = new Date().toISOString();
    const nueva: Promo = {
      id: uid("pr"),
      kind,
      name: kind === "combo" ? `Combo ${elegidos.map((e) => e.p?.name).join(" + ")}`.slice(0, 40) : (elegidos[0]?.p?.name ?? PROMO_NOMBRE[kind]),
      items,
      price: precioNum,
      from: hoy,
      until: hasta,
      ...(agotar ? { hastaAgotarStock: true } : {}),
      createdAt: ahora,
      updatedAt: ahora,
    };
    savePromo(nueva);
    setPromoId(nueva.id);
    toast.success("Promo activa: la caja ya la cobra. Ahora imprimí o compartí el cartel.");
  }

  async function compartir() {
    setBusy(true);
    try {
      const r = await compartirCartel(datos, estilo, fuente, local, medir, ciudad);
      if (r === "descargado") toast.success("Imagen descargada");
    } catch (err) {
      toast.error(errorText(err, "No se pudo armar la imagen"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Plantilla">
          {PLANTILLAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={plantilla === p.id}
              onClick={() => cambiarPlantilla(p.id)}
              className={cn("h-10 rounded-full px-3.5 text-sm font-medium", plantilla === p.id ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
            >
              {p.nombre}
            </button>
          ))}
        </div>

        {vigentesDelTipo.length ? (
          <div>
            <Label>Promos activas de este tipo</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {vigentesDelTipo.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={promoId === p.id}
                  onClick={() => setPromoId(promoId === p.id ? null : p.id)}
                  className={cn("h-9 rounded-full px-3 text-xs font-medium", promoId === p.id ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
                >
                  {p.name} · {formatARS(p.price)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {plantilla === "aviso" ? (
          <div className="grid gap-3">
            <div>
              <Label htmlFor="cartel-titulo">Título</Label>
              <Input id="cartel-titulo" className="mt-1.5" value={titulo} onChange={(e) => setTitulo(e.target.value.slice(0, 30))} />
            </div>
            <div>
              <Label htmlFor="cartel-texto">Qué dice</Label>
              <textarea
                id="cartel-texto"
                className="mt-1.5 min-h-24 w-full rounded-md bg-elevated px-3 py-2 text-sm text-fg shadow-[var(--shadow-border)]"
                value={texto}
                onChange={(e) => setTexto(e.target.value.slice(0, 160))}
                placeholder="El lunes abrimos a las 10."
              />
            </div>
          </div>
        ) : (
          <div>
            <Label htmlFor="cartel-buscar">{uno ? "Producto" : "Productos del combo"}</Label>
            {elegidos.length ? (
              <ul className="mt-1.5 space-y-1.5">
                {elegidos.map((e) => (
                  <li key={e.productId} className="rounded-lg bg-elevated px-3 py-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{e.p?.name ?? "(borrado)"}</span>
                      <span className="num text-xs text-subtle">{e.p ? formatARS(e.p.price) : ""}</span>
                      {plantilla === "combo" && !promo ? (
                        <span className="flex items-center">
                          <button type="button" aria-label="Menos" className="grid size-8 place-items-center" onClick={() => setItems((c) => c.map((it) => (it.productId === e.productId ? { ...it, qty: Math.max(1, it.qty - 1) } : it)))}>
                            <Minus className="size-3.5" />
                          </button>
                          <span className="num w-4 text-center">{e.qty}</span>
                          <button type="button" aria-label="Más" className="grid size-8 place-items-center" onClick={() => setItems((c) => c.map((it) => (it.productId === e.productId ? { ...it, qty: it.qty + 1 } : it)))}>
                            <Plus className="size-3.5" />
                          </button>
                        </span>
                      ) : null}
                      {promo ? null : (
                        <button type="button" aria-label={`Sacar ${e.p?.name ?? ""}`} className="grid size-8 place-items-center text-muted" onClick={() => setItems((c) => c.filter((it) => it.productId !== e.productId))}>
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <FotoProducto productId={e.productId} className="mt-2" />
                  </li>
                ))}
              </ul>
            ) : null}
            {promo || (uno && items.length) ? null : (
              <>
                <Input id="cartel-buscar" className="mt-1.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o código" autoComplete="off" />
                {resultados.length ? (
                  <ul className="mt-1 max-h-48 overflow-y-auto rounded-md bg-elevated p-1">
                    {resultados.map((p) => (
                      <li key={p.id}>
                        <button type="button" className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-surface" onClick={() => elegir(p)}>
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
        )}

        {kind && !promo ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cartel-precio">
                {kind === "combo" ? "Precio del combo" : kind === "2x1" ? "Precio por los 2" : "Precio de la promo, por unidad"}
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Input id="cartel-precio" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="$" className="w-32" />
                {costo != null ? <span className="num text-xs text-subtle">Costo {formatARS(costo)}</span> : null}
              </div>
            </div>
            <div>
              <Label htmlFor="cartel-hasta">Válido hasta (incluido)</Label>
              <Input id="cartel-hasta" type="date" className="mt-1.5" value={hasta} min={hoy} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={agotar} onChange={(e) => setAgotar(e.target.checked)} />
              Hasta agotar stock
            </label>
          </div>
        ) : null}

        <div className="grid gap-3">
          <div>
            <Label>Colores</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colores">
              {PALETAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={paletaId === p.id}
                  aria-label={p.nombre}
                  title={p.nombre}
                  onClick={() => setPaletaId(p.id)}
                  className={cn("flex h-10 items-center gap-1 rounded-full px-2", paletaId === p.id ? "ring-2 ring-accent" : "bg-elevated")}
                >
                  <span className="size-6 rounded-full" style={{ background: p.fondo }} />
                  <span className="-ml-2.5 size-6 rounded-full" style={{ background: p.principal }} />
                </button>
              ))}
              <label className="ml-1 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={ahorro} onChange={(e) => setAhorro(e.target.checked)} />
                Ahorro de tinta
              </label>
            </div>
          </div>
          <div>
            <Label>Letra</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Letra">
              {FUENTES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={fuenteId === f.id}
                  onClick={() => setFuenteId(f.id)}
                  style={{ fontFamily: `"${f.familia}"`, fontWeight: f.peso }}
                  className={cn("h-10 rounded-md px-3 text-base", fuenteId === f.id ? "bg-accent text-accent-fg" : "bg-elevated text-fg")}
                >
                  {f.nombre}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-md shadow-[var(--shadow-border)]" style={{ aspectRatio: "1000 / 1414" }} aria-label="Vista previa del cartel" dangerouslySetInnerHTML={{ __html: vista }} />
        {falta ? <p className="text-center text-xs text-muted">{falta}</p> : null}
        {kind && !promo ? (
          <Button onClick={activar}>Activar promo en la caja</Button>
        ) : null}
        {kind && promo ? (
          <p className="text-center text-xs text-sage">
            La caja cobra {PROMO_NOMBRE[promo.kind].toLowerCase()} {formatARS(promo.price)} hasta el {promo.until.slice(8, 10)}/{promo.until.slice(5, 7)}.
          </p>
        ) : null}
        {celu ? null : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={Boolean(falta)} onClick={() => imprimirCartel(datos, estilo, fuente, "a4", medir) || toast.error("El navegador no dejó abrir la hoja")}>
              <Printer className="size-4" />
              A4
            </Button>
            <Button variant="secondary" disabled={Boolean(falta)} onClick={() => imprimirCartel(datos, estilo, fuente, "media", medir) || toast.error("El navegador no dejó abrir la hoja")}>
              <Printer className="size-4" />
              Media hoja
            </Button>
          </div>
        )}
        <Button variant="secondary" disabled={Boolean(falta) || busy} onClick={() => void compartir()}>
          <Share2 className="size-4" />
          {busy ? "Armando…" : "Compartir imagen"}
        </Button>
      </div>

      <OwnerPinDialog
        open={pinOpen}
        mode={pinHash ? "enter" : "create"}
        onClose={() => setPinOpen(false)}
        onOk={() => {
          setPinOpen(false);
          guardarPromo();
        }}
      />
    </div>
  );
}
