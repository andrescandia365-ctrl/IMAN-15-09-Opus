import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { formatARS } from "@/lib/format";
import { productMatchesQuery } from "@/lib/pack";
import {
  defaultFactor,
  factorFor,
  invoiceForProduct,
  invoiceOf,
  misalignedProducts,
  productsForCross,
  quotedPrice,
  type InvoiceKind,
} from "@/lib/pricing";
import { usePhoneUi } from "@/lib/device";
import { useImanStore } from "@/lib/store";
import { syncNow } from "@/lib/sync";
import type { Category, Product, Settings, Supplier } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

const STEPS = [50, 100];

type PriceRow = { p: Product; next: number | null; factor: number; invoice: InvoiceKind | null };

function priceRows(opts: {
  products: Product[];
  categories: Category[];
  suppliers: Supplier[];
  settings: Settings;
  step: number;
  mode: "up" | "down";
  category: Category | null;
  supplier: Supplier | null;
  invoice: InvoiceKind | null;
  picked: Product[];
}): PriceRow[] {
  const { products, categories, suppliers, settings, step, mode, category, supplier, invoice, picked } = opts;
  if (picked.length) {
    return picked.map((p) => {
      const cat = categories.find((c) => c.id === p.categoryId) ?? null;
      const hit = invoiceForProduct(p, suppliers);
      if (!cat || !hit) return { p, next: null, factor: 1, invoice: null };
      const factor = factorFor(cat, hit.invoice, settings);
      return { p, next: quotedPrice(p, factor, step, mode), factor, invoice: hit.invoice };
    });
  }
  if (!category || !supplier || !invoice) return [];
  const factor = factorFor(category, invoice, settings);
  return productsForCross(products, category.id, supplier).map((p) => ({
    p,
    next: quotedPrice(p, factor, step, mode),
    factor,
    invoice,
  }));
}

function shownFactor(
  id: string,
  name: string,
  kind: InvoiceKind,
  stored: Record<string, number> | undefined,
  settings?: Settings,
): string {
  const n = stored?.[id];
  if (typeof n === "number" && n > 0) return String(n);
  const d = defaultFactor(name, kind, settings);
  return d != null ? String(d) : "";
}

export function OwnerPrices() {
  const categories = useImanStore((s) => s.categories);
  const products = useImanStore((s) => s.products);
  const suppliers = useImanStore((s) => s.suppliers);
  const settings = useImanStore((s) => s.settings);
  const saveSettings = useImanStore((s) => s.saveSettings);
  const saveCategory = useImanStore((s) => s.saveCategory);
  const setProductPrices = useImanStore((s) => s.setProductPrices);
  const applyCategoryPrices = useImanStore((s) => s.applyCategoryPrices);
  // En el celu se mira y no se toca: sus ajustes no viajan todavía (siguen siendo
  // los de su primer arranque), y alinear desde ahí repreciaba la góndola con
  // márgenes viejos. Márgenes y precios se cambian en la caja.
  const soloVer = usePhoneUi();
  const storeId = useImanStore((s) => s.deskStoreId);
  // Alinear y confirmar el cruce reescriben la góndola: antes se sincroniza.
  const [alDia, setAlDia] = useState(false);

  const [factorX, setFactorX] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, shownFactor(c.id, c.name, "X", settings.priceMarkups, settings)])),
  );
  const [factorA, setFactorA] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, shownFactor(c.id, c.name, "A", settings.priceMarkupsA, settings)])),
  );
  const [newName, setNewName] = useState("");
  const [newX, setNewX] = useState("");
  const [newA, setNewA] = useState("");
  const [cruceOpen, setCruceOpen] = useState(false);
  const [catId, setCatId] = useState(categories[0]?.id ?? "");
  const [supId, setSupId] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [previewed, setPreviewed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  /** El rubro cuyo margen se acaba de tocar y todavía no se aplicó ni se dejó para después. */
  const [aviso, setAviso] = useState<string | null>(null);
  const alEntrar = useRef<{ id: string; raw: string } | null>(null);

  // Misma cuenta que usa applyCategoryPrices: alinear un rubro deja su número en cero.
  const desalineados = useMemo(
    () => new Map(categories.map((c) => [c.id, misalignedProducts(products, c, suppliers, settings).length])),
    [categories, products, suppliers, settings],
  );
  const totalDesalineados = [...desalineados.values()].reduce((a, n) => a + n, 0);

  function alSalirDelMargen(id: string, raw: string) {
    const antes = alEntrar.current;
    alEntrar.current = null;
    if (!antes || antes.id !== id || antes.raw === raw) return;
    setAviso((desalineados.get(id) ?? 0) > 0 ? id : null);
  }

  /**
   * Alinear y confirmar el cruce reescriben la góndola entera: se hacen con los
   * márgenes al día. Pide red y sincroniza justo antes, en PC y en celu; así
   * un margen que otro aparato cambió entra antes de calcular. Cambiar un
   * margen no lo pide: viaja solo (evento markup) y no pisa nada.
   */
  async function margenesAlDia(): Promise<boolean> {
    if (!navigator.onLine) {
      toast.error("Sin red. Alinear cambia los precios de góndola: se hace con internet, así usa los márgenes al día.");
      return false;
    }
    setAlDia(true);
    try {
      const r = await syncNow(storeId);
      if (!r.ok) {
        toast.error("No se pudo sincronizar. Probá de nuevo: los precios se cambian con los márgenes al día.");
        return false;
      }
      return true;
    } catch {
      toast.error("No se pudo sincronizar. Probá de nuevo: los precios se cambian con los márgenes al día.");
      return false;
    } finally {
      setAlDia(false);
    }
  }

  /** `null` = todos los rubros: después de sincronizar, los desalineados pueden ser otros. */
  async function alinear(ids: string[] | null) {
    if (alDia || !(await margenesAlDia())) return;
    const lista = ids ?? useImanStore.getState().categories.map((c) => c.id);
    let n = 0;
    for (const id of lista) n += applyCategoryPrices(id);
    setAviso(null);
    toast.success(n ? `${n} ${n === 1 ? "precio" : "precios"} de góndola` : "Sin cambios");
  }

  const step = settings.roundStep && settings.roundStep > 0 ? settings.roundStep : 100;
  const mode = settings.roundMode === "down" ? "down" : "up";
  const supplier = suppliers.find((s) => s.id === supId) ?? null;
  const category = categories.find((c) => c.id === catId) ?? null;
  const invoice = supplier ? invoiceOf(supplier) : null;

  const picked = useMemo(
    () => productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => Boolean(p)),
    [productIds, products],
  );
  const hasPick = Boolean(supId) || productIds.length > 0;

  const rows = useMemo(
    () =>
      priceRows({
        products,
        categories,
        suppliers,
        settings,
        step,
        mode,
        category,
        supplier,
        invoice,
        picked,
      }),
    [products, categories, suppliers, settings, step, mode, category, supplier, invoice, picked],
  );

  const ready = rows.filter((r) => r.next != null && r.next !== r.p.price);
  const skipped = rows.filter((r) => r.next == null);

  function parseFactor(raw: string): number | undefined {
    if (raw.trim() === "") return undefined;
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  function persistMap(which: "priceMarkups" | "priceMarkupsA", id: string, raw: string) {
    const next = { ...(settings[which] ?? {}) };
    const n = parseFactor(raw);
    if (n == null) delete next[id];
    else next[id] = n;
    saveSettings({ [which]: next });
  }

  function addRubro(): boolean {
    const name = newName.trim();
    if (!name) {
      toast.error("Poné el nombre del rubro");
      return false;
    }
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Ese rubro ya está");
      return false;
    }
    let x = parseFactor(newX);
    let a = parseFactor(newA);
    if (x == null && a == null) {
      toast.error("Poné un factor, ej. 1.45");
      return false;
    }
    if (x == null) x = a;
    if (a == null) a = x;
    const id = uid("c");
    saveCategory({ id, name, sort: categories.length + 1 });
    saveSettings({
      priceMarkups: { ...(settings.priceMarkups ?? {}), [id]: x! },
      priceMarkupsA: { ...(settings.priceMarkupsA ?? {}), [id]: a! },
    });
    setFactorX((m) => ({ ...m, [id]: String(x) }));
    setFactorA((m) => ({ ...m, [id]: String(a) }));
    setNewName("");
    setNewX("");
    setNewA("");
    setCatId(id);
    toast.success(`${name} · X ${x} · A ${a}`);
    return true;
  }

  function listar() {
    if (picked.length) {
      setPreviewed(true);
      if (!rows.length) toast.error("Esos productos no tienen Fac A/X de un proveedor.");
      return;
    }
    if (!category) {
      toast.error("Elegí un rubro");
      return;
    }
    if (!supplier) {
      toast.error("Elegí un proveedor");
      return;
    }
    if (!invoice) {
      toast.error("Ese proveedor no tiene Fac A ni Fac X");
      return;
    }
    setPreviewed(true);
    if (!rows.length) toast.error("Nada en ese cruce. El proveedor tiene que traer ese rubro.");
  }

  function limpiar() {
    setSupId("");
    setProductIds([]);
    setPreviewed(false);
  }

  /** Lo que el cruce va a pisar, calculado con el estado de ahora (no el de la última vez que se dibujó). */
  function cruceAhora(): { id: string; price: number }[] {
    const st = useImanStore.getState();
    const sup = st.suppliers.find((s) => s.id === supId) ?? null;
    const stStep = st.settings.roundStep && st.settings.roundStep > 0 ? st.settings.roundStep : 100;
    return priceRows({
      products: st.products,
      categories: st.categories,
      suppliers: st.suppliers,
      settings: st.settings,
      step: stStep,
      mode: st.settings.roundMode === "down" ? "down" : "up",
      category: st.categories.find((c) => c.id === catId) ?? null,
      supplier: sup,
      invoice: sup ? invoiceOf(sup) : null,
      picked: productIds.map((id) => st.products.find((p) => p.id === id)).filter((p): p is Product => Boolean(p)),
    })
      .filter((r) => r.next != null && r.next !== r.p.price)
      .map((r) => ({ id: r.p.id, price: r.next! }));
  }

  async function confirm() {
    if (!previewed) {
      toast.error("Listá el cruce primero");
      return;
    }
    const antes = cruceAhora();
    if (!antes.length) {
      toast.error("Nada para pisar. Falta costo por unidad o el precio ya está.");
      return;
    }
    if (alDia || !(await margenesAlDia())) return;
    // Si otro aparato cambió márgenes, costos o precios, la lista que se miró
    // ya no es la que se aplicaría: se muestra la nueva y se confirma de nuevo.
    const updates = cruceAhora();
    const igual =
      updates.length === antes.length &&
      updates.every((u, i) => u.id === antes[i]!.id && u.price === antes[i]!.price);
    if (!igual) {
      toast.error("Cambiaron márgenes o costos desde otro aparato. Revisá la lista y confirmá de nuevo.");
      return;
    }
    const n = setProductPrices(updates);
    setPreviewed(false);
    toast.success(n ? `${n} precios de góndola` : "Sin cambios");
  }

  const selectClass =
    "mt-1 flex h-11 w-full rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)]";

  const cruce = (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="grid shrink-0 gap-2">
            <div>
              <Label>Rubro</Label>
              <select
                className={selectClass}
                value={catId}
                onChange={(e) => {
                  setCatId(e.target.value);
                  setPreviewed(false);
                }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Proveedor</Label>
              <select
                className={selectClass}
                value={supId}
                onChange={(e) => {
                  setSupId(e.target.value);
                  setProductIds([]);
                  setPreviewed(false);
                }}
              >
                <option value="">Elegí</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {invoiceOf(s) ? ` · Fac ${invoiceOf(s)}` : " · sin factura"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Productos</Label>
              <ProductPick
                products={products.filter((p) => p.active)}
                selected={productIds}
                sheet={soloVer}
                onChange={(ids) => {
                  setProductIds(ids);
                  if (ids.length) setSupId("");
                  setPreviewed(false);
                }}
              />
            </div>
          </div>
          {hasPick ? (
            <div className="mt-2 flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button variant="secondary" onClick={listar}>
                Listar
              </Button>
              {soloVer ? null : (
                <Button disabled={!previewed || !ready.length || alDia} onClick={() => void confirm()}>
                  {alDia ? "Sincronizando…" : `Confirmar ${ready.length ? `(${ready.length})` : ""}`}
                </Button>
              )}
              <Button variant="secondary" onClick={limpiar}>
                Limpiar
              </Button>
            </div>
          ) : null}
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {previewed && rows.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                {picked.length ? "Sin Fac A/X de un proveedor para esos productos." : "Ese proveedor no trae este rubro."}
              </p>
            ) : previewed && (supplier || picked.length) ? (
              <>
                <p className="text-xs text-subtle">
                  {picked.length
                    ? picked.length === 1
                      ? picked[0]!.name
                      : `${picked.length} productos`
                    : `${category?.name ?? ""} · ${supplier?.name ?? ""}`}
                  {picked.length ? "" : ` · Fac ${invoice ?? "—"} · factor ${invoice && category ? factorFor(category, invoice, settings) : "—"}`}
                </p>
                <ul className="mt-2">
                  {rows.map(({ p, next, invoice: fac }) => (
                    <li key={p.id} className="flex flex-col gap-0.5 border-t border-border py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                      <span className="min-w-0 font-medium">
                        {p.name}
                        {picked.length && fac ? (
                          <span className="ml-2 font-sans text-xs font-normal text-subtle">Fac {fac}</span>
                        ) : null}
                      </span>
                      <span className="num text-muted">
                        {p.cost != null && p.cost > 0 ? `${formatARS(p.cost)} u.` : "sin costo u."}
                        {" → "}
                        {next == null ? "—" : formatARS(next)}
                      </span>
                    </li>
                  ))}
                </ul>
                {skipped.length ? (
                  <p className="mt-2 text-xs text-subtle">{skipped.length} sin costo por unidad: no se tocan.</p>
                ) : null}
              </>
            ) : (
              <p className="py-8 text-center text-sm text-subtle">Elegí un proveedor o un producto, y listá.</p>
            )}
          </div>
        </div>
  );

  if (soloVer) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">
          Desde el celu se mira. Márgenes y precios se cambian en la caja.
        </p>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Redondeo</p>
          <p className="mt-1.5 text-sm">
            De a <span className="num">{step}</span> · {mode === "down" ? "abajo" : "arriba"}
          </p>
        </div>
        <ul>
          {categories.map((c) => {
            const n = desalineados.get(c.id) ?? 0;
            const x = factorX[c.id] ?? shownFactor(c.id, c.name, "X", settings.priceMarkups, settings);
            const a = factorA[c.id] ?? shownFactor(c.id, c.name, "A", settings.priceMarkupsA, settings);
            return (
              <li key={c.id} className="border-t border-border py-3">
                <p className="font-medium">{c.name}</p>
                <dl className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Fac X</dt>
                    <dd className="num mt-0.5 text-xl font-medium">{x || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Fac A</dt>
                    <dd className="num mt-0.5 text-xl font-medium">{a || "—"}</dd>
                  </div>
                </dl>
                {n > 0 ? (
                  <p className="mt-1.5 text-xs text-warn">
                    {n} {n === 1 ? "precio desalineado" : "precios desalineados"}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <Button className="w-full" onClick={() => setCruceOpen(true)}>
          Listar precios
        </Button>
        <Dialog open={cruceOpen} onOpenChange={setCruceOpen}>
          <DialogContent className="flex h-[min(80dvh,44rem)] w-[min(56rem,calc(100vw-24px))] max-w-none flex-col overflow-hidden p-6">
            <DialogHeader className="mb-5 shrink-0 pr-10">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Precios</p>
              <DialogTitle className="mt-1 font-display text-3xl leading-none tracking-tight">Listar</DialogTitle>
              <DialogDescription>Se mira. Confirmar el recálculo es en la caja.</DialogDescription>
            </DialogHeader>
            {cruce}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(17rem,0.9fr)_minmax(0,1.2fr)]">
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Redondeo</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STEPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={cn(
                    "h-11 min-w-14 rounded-full px-3 text-sm font-medium",
                    step === s ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
                  )}
                  disabled={soloVer}
                  onClick={() => saveSettings({ roundStep: s })}
                >
                  {s}
                </button>
              ))}
              <Input
                className="h-11 w-20"
                inputMode="numeric"
                value={String(step)}
                readOnly={soloVer}
                onChange={(e) => saveSettings({ roundStep: Math.max(1, Number(e.target.value) || 100) })}
                aria-label="Paso de redondeo"
              />
              <button
                type="button"
                className={cn(
                  "h-11 flex-1 rounded-full px-3 text-sm font-medium",
                  mode === "up" ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
                )}
                disabled={soloVer}
                onClick={() => saveSettings({ roundMode: "up" })}
              >
                Arriba
              </button>
              <button
                type="button"
                className={cn(
                  "h-11 flex-1 rounded-full px-3 text-sm font-medium",
                  mode === "down" ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
                )}
                disabled={soloVer}
                onClick={() => saveSettings({ roundMode: "down" })}
              >
                Abajo
              </button>
            </div>
          </div>
          {totalDesalineados > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg bg-warn/10 px-3 py-2">
              <p className="text-sm">
                <span className="num font-medium text-warn">{totalDesalineados}</span>{" "}
                {totalDesalineados === 1
                  ? "producto tiene el precio desalineado del margen"
                  : "productos tienen el precio desalineado del margen"}
              </p>
              <Button
                size="sm"
                className="ml-auto"
                disabled={soloVer || alDia}
                onClick={() => void alinear(null)}
              >
                {alDia ? "Sincronizando…" : "Alinear todo"}
              </Button>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                  <th className="py-2 text-left">Rubro</th>
                  <th className="py-2 text-right">Fac X</th>
                  <th className="py-2 text-right">Fac A</th>
                  <th className="py-2">
                    <span className="sr-only">Desalineados</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => {
                  const n = desalineados.get(c.id) ?? 0;
                  return (
                    <Fragment key={c.id}>
                      <tr className="border-t border-border">
                        <td className="py-1.5 pr-2 font-medium">{c.name}</td>
                        <td className="py-1.5">
                          <Input
                            className="ml-auto h-10 w-[4.5rem] text-right"
                            inputMode="decimal"
                            value={factorX[c.id] ?? shownFactor(c.id, c.name, "X", settings.priceMarkups, settings)}
                            readOnly={soloVer}
                            onFocus={(e) => (alEntrar.current = { id: c.id, raw: e.target.value })}
                            onBlur={(e) => alSalirDelMargen(c.id, e.target.value)}
                            onChange={(e) => {
                              setFactorX((m) => ({ ...m, [c.id]: e.target.value }));
                              persistMap("priceMarkups", c.id, e.target.value);
                            }}
                            placeholder="—"
                          />
                        </td>
                        <td className="py-1.5 pl-2">
                          <Input
                            className="ml-auto h-10 w-[4.5rem] text-right"
                            inputMode="decimal"
                            value={factorA[c.id] ?? shownFactor(c.id, c.name, "A", settings.priceMarkupsA, settings)}
                            readOnly={soloVer}
                            onFocus={(e) => (alEntrar.current = { id: c.id, raw: e.target.value })}
                            onBlur={(e) => alSalirDelMargen(c.id, e.target.value)}
                            onChange={(e) => {
                              setFactorA((m) => ({ ...m, [c.id]: e.target.value }));
                              persistMap("priceMarkupsA", c.id, e.target.value);
                            }}
                            placeholder="—"
                          />
                        </td>
                        <td className="py-1.5 pl-2 text-right">
                          {n > 0 ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="num text-sm font-medium text-warn">{n}</span>
                              <button
                                type="button"
                                aria-label={`Alinear ${c.name}`}
                                disabled={soloVer || alDia}
                                className="h-8 rounded-full bg-elevated px-2.5 text-xs font-medium text-muted hover:text-fg disabled:opacity-50"
                                onClick={() => void alinear([c.id])}
                              >
                                Alinear
                              </button>
                            </span>
                          ) : null}
                        </td>
                      </tr>
                      {aviso === c.id && n > 0 ? (
                        <tr>
                          <td colSpan={4} className="pb-2">
                            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warn/10 px-3 py-2">
                              <p className="text-sm">
                                Este margen cambia <span className="num font-medium">{n}</span>{" "}
                                {n === 1 ? "precio" : "precios"} de góndola.
                              </p>
                              <div className="ml-auto flex gap-2">
                                <Button size="sm" disabled={soloVer || alDia} onClick={() => void alinear([c.id])}>
                                  Aplicar ahora
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => setAviso(null)}>
                                  Después
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 self-start"
            disabled={soloVer}
            onClick={() => setAddOpen(true)}
          >
            Agregar rubro
          </Button>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-bg p-3">{cruce}</div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="w-[min(36rem,calc(100vw-48px))] max-w-none p-6">
          <DialogHeader className="mb-4 pr-10">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Precios</p>
            <DialogTitle className="mt-1 font-display text-3xl leading-none tracking-tight">
              Agregar rubro
            </DialogTitle>
            <DialogDescription>Un factor se copia a Fac A y Fac X si dejás uno vacío.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem]">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Juguetes" />
            <Input inputMode="decimal" value={newX} onChange={(e) => setNewX(e.target.value)} placeholder="X 1.45" />
            <Input inputMode="decimal" value={newA} onChange={(e) => setNewA(e.target.value)} placeholder="A 1.45" />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (addRubro()) setAddOpen(false);
              }}
            >
              Agregar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductPick({
  products,
  selected,
  onChange,
  sheet,
}: {
  products: Product[];
  selected: string[];
  onChange: (ids: string[]) => void;
  sheet?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const chosen = products.filter((p) => selected.includes(p.id));
  const list = products
    .filter((p) => productMatchesQuery(p, q))
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .slice(0, 60);

  useEffect(() => {
    if (!open || sheet) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    place();
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, sheet]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const label =
    chosen.length === 0 ? "Elegí" : chosen.length === 1 ? chosen[0]!.name : `${chosen.length} productos`;

  return (
    <div ref={box} className="relative">
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex h-11 w-full items-center justify-between gap-2 rounded-md bg-elevated px-3 text-left text-sm text-fg shadow-[var(--shadow-border)]"
      >
        <span className={cn("min-w-0 truncate", chosen.length ? "text-fg" : "text-muted")}>{label}</span>
        <ChevronDown className="size-4 shrink-0 text-subtle" />
      </button>
      {open && (sheet || pos) ? (
        <div
          className={
            sheet
              ? "mt-1 rounded-md bg-elevated p-2"
              : "fixed z-50 rounded-md bg-surface p-2 shadow-[var(--shadow-border)]"
          }
          style={sheet ? undefined : { top: pos!.top, left: pos!.left, width: Math.max(pos!.width, 220) }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre o código"
            className="h-10"
            autoFocus
          />
          <ul className="mt-1 max-h-44 overflow-y-auto" role="listbox" aria-multiselectable>
            {list.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted">Nada con esa búsqueda.</li>
            ) : (
              list.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => toggle(p.id)}
                      className={cn(
                        "flex h-11 w-full items-center rounded-md px-2 text-left text-sm",
                        on ? "bg-accent text-accent-fg" : "hover:bg-elevated",
                      )}
                    >
                      <span className="min-w-0 truncate">{p.name}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
      {chosen.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chosen.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className="inline-flex h-11 max-w-full items-center gap-1 rounded-full bg-elevated px-3 text-xs text-fg"
              aria-label={`Quitar ${p.name}`}
            >
              <span className="min-w-0 truncate">{p.name}</span>
              <X className="size-3 shrink-0 text-muted" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
