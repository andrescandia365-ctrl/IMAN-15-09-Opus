import { useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Download, Hash, Minus, PackagePlus, Pencil, Plus, Printer, Search, Tags, Trash2, Upload } from "lucide-react";
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
import { daysUntil, formatARS } from "@/lib/format";
import {
  applyCatalogPreview,
  detectNumberFormat,
  materializeCatalog,
  parseCatalogFile,
  parseLocaleNumber,
  downloadCatalogCsv,
  downloadCatalogXlsx,
  type CatalogDraft,
  type CatalogPreviewRow,
  type NumberFormat,
} from "@/lib/catalog-io";
import { printGondolaLabels, printListaLabels, printShortCodeSheet } from "@/lib/print";
import { CameraScan } from "@/components/camera-scan";
import { findByScan, packOf, productMatchesQuery, shortCodeOf, stockBreakdown } from "@/lib/pack";
import { buildSuggestions } from "@/lib/suggest";
import { useImanStore } from "@/lib/store";
import type { Product } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

type Filter = "all" | "cats" | "suggest" | "low" | "expire";

export function InventoryView() {
  const products = useImanStore((s) => s.products);
  const categories = useImanStore((s) => s.categories);
  const saveProduct = useImanStore((s) => s.saveProduct);
  const deleteProduct = useImanStore((s) => s.deleteProduct);
  const saveCategory = useImanStore((s) => s.saveCategory);
  const deleteCategory = useImanStore((s) => s.deleteCategory);
  const adjustStock = useImanStore((s) => s.adjustStock);
  const sales = useImanStore((s) => s.sales);
  const suppliers = useImanStore((s) => s.suppliers);
  const orders = useImanStore((s) => s.orders);

  const importCatalog = useImanStore((s) => s.importCatalog);
  const settings = useImanStore((s) => s.settings);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [cat, setCat] = useState<string | "all">("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [editCats, setEditCats] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [editItems, setEditItems] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);

  const lowN = products.filter((p) => p.active && p.stock <= p.stockMin).length;
  const expN = products.filter((p) => {
    const d = daysUntil(p.expiresAt);
    return d !== null && d <= 7;
  }).length;

  const list = useMemo(() => {
    return products
      .filter((p) => cat === "all" || p.categoryId === cat)
      .filter((p) => {
        if (filter === "low") return p.stock <= p.stockMin;
        if (filter === "expire") {
          const d = daysUntil(p.expiresAt);
          return d !== null && d <= 7;
        }
        if (filter === "cats") return cat === "all" || p.categoryId === cat;
        return true;
      })
      .filter((p) => {
        return productMatchesQuery(p, q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [products, q, filter, cat]);

  function startNew() {
    setEditing({
      id: uid("p"),
      name: "",
      barcode: "",
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
    setOpen(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en inventario"
            className="bg-paper pl-10 text-ink placeholder:text-ink-muted"
          />
        </div>
        <Button variant="secondary" onClick={() => setLabelsOpen(true)}>
          <Tags className="size-4" />
          Etiquetas
        </Button>
        <Button variant="secondary" onClick={() => setCodesOpen(true)}>
          <Hash className="size-4" />
          Códigos personalizados
        </Button>
        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          <Download className="size-4" />
          Importar
        </Button>
        <Button variant="secondary" onClick={() => setExportOpen(true)}>
          <Upload className="size-4" />
          Exportar
        </Button>
        <Button variant="secondary" onClick={() => setEditItems((v) => !v)}>
          {editItems ? "Listo" : "Editar"}
        </Button>
        <Button onClick={startNew}>
          <PackagePlus className="size-4" />
          Nuevo
        </Button>
      </div>

      <div className="flex w-full flex-col gap-2">
        <div className="flex w-full gap-2">
          <FilterChip
            className="flex-1"
            active={filter === "all"}
            onClick={() => {
              setFilter("all");
              setCat("all");
            }}
          >
            Todos <span className="num">{products.length}</span>
          </FilterChip>
          <FilterChip className="flex-1" active={filter === "cats"} onClick={() => setFilter("cats")}>
            Categorías
          </FilterChip>
          <FilterChip className="flex-1" active={filter === "suggest"} onClick={() => setFilter("suggest")}>
            Sugerencias
          </FilterChip>
          <FilterChip className="flex-1" active={filter === "low"} onClick={() => setFilter("low")}>
            Stock bajo · {lowN}
          </FilterChip>
          <FilterChip className="flex-1" active={filter === "expire"} onClick={() => setFilter("expire")}>
            Vencimientos · {expN}
          </FilterChip>
        </div>
        {filter === "expire" ? (
          <FilterChip active={false} onClick={() => setCamOpen(true)}>
            <AlertTriangle className="size-4" />
            Escanear fecha
          </FilterChip>
        ) : null}
      </div>

      {filter === "cats" ? (
        <div className="flex flex-col gap-2">
          <div className="flex w-full flex-wrap gap-2">
            <FilterChip className="min-w-0 flex-1" active={cat === "all"} onClick={() => setCat("all")}>
              Todas
            </FilterChip>
            {categories.map((c) => (
              <span key={c.id} className="inline-flex min-w-0 flex-1 items-center">
                <FilterChip className="min-w-0 flex-1" active={cat === c.id} onClick={() => setCat(c.id)}>
                  {c.name}
                </FilterChip>
                {editCats ? (
                  <button
                    type="button"
                    className="ml-0.5 grid size-8 shrink-0 place-items-center rounded-full text-subtle hover:bg-elevated hover:text-danger"
                    aria-label={`Quitar ${c.name}`}
                    onClick={() => {
                      const r = deleteCategory(c.id);
                      if (!r.ok) toast.error(r.error);
                      else {
                        if (cat === c.id) setCat("all");
                        toast.success("Categoría quitada");
                      }
                    }}
                  >
                    <Trash2 className="size-3" />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditCats((v) => !v)}>
              {editCats ? "Listo" : "Editar categorías"}
            </Button>
            {editCats ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newCat.trim();
                  if (!name) return;
                  saveCategory({ id: uid("c"), name, sort: categories.length + 1 });
                  setNewCat("");
                  toast.success("Categoría agregada");
                }}
              >
                <Input
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  placeholder="Nueva categoría"
                  className="h-8 w-40"
                />
                <Button type="submit" size="sm" variant="secondary">
                  Agregar
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-surface p-2 shadow-[var(--shadow-border)] sm:p-3">
        {filter === "suggest" ? (
          <SuggestBoard
            products={products}
            sales={sales}
            suppliers={suppliers}
            orders={orders}
            onOffer={(p) => saveProduct({ ...p, onOffer: true })}
          />
        ) : list.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-subtle">No hay productos con ese filtro.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {list.map((p) => {
              const exp = daysUntil(p.expiresAt);
              const catName = categories.find((c) => c.id === p.categoryId)?.name;
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-elevated/80"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-lg font-medium tracking-tight">{p.name}</span>
                      {packOf(p) > 1 ? <Badge>Pack x{packOf(p)}</Badge> : null}
                      {!p.active ? <Badge>Inactivo</Badge> : null}
                      {p.onOffer ? <Badge variant="sage">Oferta</Badge> : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                      {shortCodeOf(p) ? <span className="font-mono">#{shortCodeOf(p)}</span> : null}
                      {p.barcode ? <span className="font-mono">{p.barcode}</span> : null}
                      {catName ? <span>{catName}</span> : null}
                      {p.cost != null ? <span>Costo {formatARS(p.cost)}</span> : null}
                      {exp !== null ? (
                        <span className={exp <= 1 ? "text-danger" : exp <= 7 ? "text-warn" : ""}>
                          {exp < 0 ? "Vencido" : exp === 0 ? "Vence hoy" : `Vence ${p.expiresAt}`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-4">
                    <span className="num text-lg font-medium text-sage">{formatARS(p.price)}</span>
                    <span className={cn("num text-sm", p.stock <= p.stockMin ? "text-warn" : "text-muted")}>
                      {stockBreakdown(p)}
                    </span>
                  </div>
                  {editItems ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="grid size-9 place-items-center rounded-sm hover:bg-bg"
                      onClick={() => adjustStock(p.id, -1, "ajuste")}
                      aria-label="Bajar stock"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="grid size-9 place-items-center rounded-sm hover:bg-bg"
                      onClick={() => adjustStock(p.id, 1, "ajuste")}
                      aria-label="Subir stock"
                    >
                      <Plus className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="grid size-9 place-items-center rounded-sm hover:bg-bg"
                      onClick={() => {
                        setEditing({ ...p });
                        setOpen(true);
                      }}
                      aria-label="Editar"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="grid size-9 place-items-center rounded-sm text-muted hover:text-danger"
                      onClick={() => {
                        deleteProduct(p.id);
                        toast("Producto quitado");
                      }}
                      aria-label="Eliminar"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ProductDialog
        open={open}
        onOpenChange={setOpen}
        product={editing}
        onChange={setEditing}
        onSave={() => {
          if (!editing || !editing.name.trim() || editing.price < 0) {
            toast.error("Nombre y precio son obligatorios");
            return;
          }
          saveProduct({
            ...editing,
            name: editing.name.trim(),
            priceUpdatedAt: new Date().toISOString(),
          });
          setOpen(false);
          toast.success("Producto guardado");
        }}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onApply={(rows) => {
          const next = applyCatalogPreview(rows, products, categories);
          importCatalog(next.products, next.categories);
          toast.success(`${rows.length} filas aplicadas`);
        }}
      />
      <LabelsDialog
        open={labelsOpen}
        onOpenChange={setLabelsOpen}
        products={products}
        categories={categories}
        store={settings.name}
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        onCsv={() => {
          downloadCatalogCsv(products, categories, settings.name);
          toast.success("CSV listo");
          setExportOpen(false);
        }}
        onXlsx={() => {
          downloadCatalogXlsx(products, categories, settings.name);
          toast.success("Excel listo");
          setExportOpen(false);
        }}
      />
      <ShortCodesDialog
        open={codesOpen}
        onOpenChange={setCodesOpen}
        products={products}
        categories={categories}
        store={settings.name}
        onSave={saveProduct}
      />
      {camOpen ? (
        <CameraScan
          onClose={() => setCamOpen(false)}
          onCode={(code) => {
            const hit = findByScan(products, code);
            if (!hit) {
              toast.error(`No está: ${code}`);
              return;
            }
            setEditing({ ...hit.product });
            setOpen(true);
            setCamOpen(false);
            toast.success("Anotá la fecha de vencimiento");
          }}
        />
      ) : null}
    </div>
  );
}

function SuggestBoard({
  products,
  sales,
  suppliers,
  orders,
  onOffer,
}: {
  products: Product[];
  sales: Parameters<typeof buildSuggestions>[0]["sales"];
  suppliers: Parameters<typeof buildSuggestions>[0]["suppliers"];
  orders: Parameters<typeof buildSuggestions>[0]["orders"];
  onOffer: (p: Product) => void;
}) {
  const tips = buildSuggestions({ products, sales, suppliers, orders });
  return (
    <div className="space-y-3 p-2">
      <p className="font-display text-2xl tracking-tight">Sugerencias</p>
      <p className="text-sm text-muted">
        Lo que la góndola ya sabe y el Excel no. Ofertas, pedidos, lo que se está yendo.
      </p>
      {tips.length === 0 ? (
        <p className="rounded-lg bg-elevated px-4 py-8 text-center text-sm text-subtle">
          Hoy no hay drama. Cuando venza algo o se venda de más, aparece acá.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {tips.map((t) => {
            const p = t.productId ? products.find((x) => x.id === t.productId) : null;
            return (
              <li
                key={t.id}
                className="rounded-xl bg-paper p-4 text-ink shadow-[var(--shadow-ticket)] ticket-grain"
              >
                <p className="text-[11px] uppercase tracking-[0.14em] text-ink-muted">{t.kind}</p>
                <p className="mt-1 font-display text-lg leading-tight">{t.title}</p>
                <p className="mt-2 text-sm text-ink-muted">{t.body}</p>
                {p && !p.onOffer && t.kind === "offer" ? (
                  <Button size="sm" className="mt-3" onClick={() => onOffer(p)}>
                    Poner en oferta
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  children,
  onClick,
  className,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-3 text-base font-medium",
        active ? "bg-accent text-accent-fg" : "bg-surface text-muted shadow-[var(--shadow-border)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ProductDialog({
  open,
  onOpenChange,
  product,
  onChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  onChange: (p: Product) => void;
  onSave: () => void;
}) {
  const categories = useImanStore((s) => s.categories);
  const [tab, setTab] = useState<"rapida" | "detalles">("rapida");
  if (!product) return null;
  const set = (patch: Partial<Product>) => onChange({ ...product, ...patch });
  const isNew = !product.name;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) setTab("rapida");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Alta rápida" : "Editar producto"}</DialogTitle>
          <DialogDescription>
            Nombre, código y un precio de góndola. Costo por unidad y pack van en Detalles.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5">
          <button
            type="button"
            className={cn(
              "h-8 rounded-full px-3 text-xs font-medium",
              tab === "rapida" ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
            )}
            onClick={() => setTab("rapida")}
          >
            Alta rápida
          </button>
          <button
            type="button"
            className={cn(
              "h-8 rounded-full px-3 text-xs font-medium",
              tab === "detalles" ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
            )}
            onClick={() => setTab("detalles")}
          >
            Detalles
          </button>
        </div>
        {tab === "rapida" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nombre</Label>
              <Input value={product.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div>
              <Label>Código</Label>
              <Input value={product.barcode} onChange={(e) => set({ barcode: e.target.value })} />
            </div>
            <div>
              <Label>Categoría</Label>
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
            <div className="col-span-2">
              <Label>Precio</Label>
              <Input
                inputMode="numeric"
                value={product.price || ""}
                onChange={(e) => set({ price: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Costo por unidad</Label>
              <Input
                inputMode="numeric"
                value={product.cost ?? ""}
                onChange={(e) => set({ cost: e.target.value === "" ? null : Number(e.target.value) || 0 })}
              />
              <p className="mt-1 text-[11px] text-subtle">No es el costo del bulto.</p>
            </div>
            <div>
              <Label>Precio de venta</Label>
              <Input
                inputMode="numeric"
                value={product.price || ""}
                onChange={(e) => set({ price: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Stock</Label>
              <Input
                inputMode="numeric"
                value={product.stock}
                onChange={(e) => set({ stock: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Mínimo</Label>
              <Input
                inputMode="numeric"
                value={product.stockMin}
                onChange={(e) => set({ stockMin: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Pack (u. del bulto)</Label>
              <Input
                inputMode="numeric"
                value={product.packQty ?? 1}
                onChange={(e) => set({ packQty: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
            <div>
              <Label>Código del pack</Label>
              <Input
                value={product.packBarcode ?? ""}
                onChange={(e) => set({ packBarcode: e.target.value })}
                placeholder="Pistola del bulto"
              />
            </div>
            <div>
              <Label>Vence</Label>
              <Input
                type="date"
                value={product.expiresAt ?? ""}
                onChange={(e) => set({ expiresAt: e.target.value || null })}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={product.active}
                  onChange={(e) => set({ active: e.target.checked })}
                />
                Activo
              </label>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={Boolean(product.onOffer)}
                  onChange={(e) => set({ onOffer: e.target.checked })}
                />
                En oferta
              </label>
            </div>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {tab === "rapida" ? (
            <Button variant="secondary" onClick={() => setTab("detalles")}>
              Detalles
            </Button>
          ) : null}
          <Button onClick={onSave}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (rows: CatalogPreviewRow[]) => void;
}) {
  const [draft, setDraft] = useState<CatalogDraft | null>(null);
  const [format, setFormat] = useState<NumberFormat | null>(null);
  const [needPick, setNeedPick] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exampleRaw =
    draft?.samples.find((s) => /[.,]/.test(s)) || draft?.samples.find((s) => s.trim()) || "7,500.00";
  const exampleVal = format ? parseLocaleNumber(exampleRaw, format) : null;
  const rows = draft && format ? materializeCatalog(draft, format) : [];
  const missing = draft?.missing ?? [];

  async function readFile(file: File) {
    setError(null);
    setDraft(null);
    setFormat(null);
    setNeedPick(false);
    try {
      const parsed = await parseCatalogFile(file);
      setDraft(parsed);
      if (!parsed.rows.length) {
        setError(
          parsed.missing.includes("NOMBRE")
            ? "Falta la columna NOMBRE. La primera fila tiene que ser el encabezado."
            : "No hay filas con nombre.",
        );
        return;
      }
      const det = detectNumberFormat(parsed.samples);
      if (det.confident && det.format) setFormat(det.format);
      else {
        setFormat(null);
        setNeedPick(true);
      }
    } catch {
      setError("No se pudo leer el archivo.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setDraft(null);
          setFormat(null);
          setNeedPick(false);
          setError(null);
          setDropOver(false);
        }
      }}
    >
      <DialogContent className="flex h-[min(80dvh,52rem)] w-[min(1040px,calc(100vw-32px))] max-w-none flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Importar catálogo</DialogTitle>
        </DialogHeader>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.tsv,.xlsx,.xls"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void readFile(f);
            e.target.value = "";
          }}
        />
        {draft?.rows.length ? (
          <div className="mb-1 shrink-0">
            <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              Seleccionar archivo
            </Button>
          </div>
        ) : null}
        {error ? <p className="mt-2 shrink-0 text-sm text-danger">{error}</p> : null}
        {missing.length ? (
          <p className="mt-2 shrink-0 text-sm text-warn">
            Faltan columnas: {missing.join(", ")}. Quedan vacías / 0. No se inventa costo ni Fac A.
          </p>
        ) : null}
        {draft?.rows.length ? (
          <div className="mt-3 shrink-0 rounded-xl bg-elevated p-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-subtle">Formato de número</p>
            {needPick && !format ? (
              <p className="mt-1 text-sm text-warn">No está claro. Elegí Yanqui o Latino antes de confirmar.</p>
            ) : null}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={cn(
                  "h-11 flex-1 rounded-md text-sm font-medium",
                  format === "us" ? "bg-accent text-accent-fg" : "bg-surface text-muted",
                )}
                onClick={() => setFormat("us")}
              >
                Yanqui · 1,234.56
              </button>
              <button
                type="button"
                className={cn(
                  "h-11 flex-1 rounded-md text-sm font-medium",
                  format === "latam" ? "bg-accent text-accent-fg" : "bg-surface text-muted",
                )}
                onClick={() => setFormat("latam")}
              >
                Latino · 1.234,56
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">
              {format && exampleVal != null
                ? `${exampleRaw} se va a leer como ${formatARS(exampleVal)}`
                : `${exampleRaw} — elegí un formato para ver el número`}
            </p>
          </div>
        ) : null}
        {draft?.rows.length ? (
          <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md bg-bg">
            <p className="sticky top-0 z-10 bg-bg px-3 py-2 text-xs text-subtle">
              {draft.rows.length} filas · costo por unidad · stock en unidades
            </p>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.08em] text-subtle">
                  <th className="px-3 py-1 font-medium">Código</th>
                  <th className="px-3 py-1 font-medium">Nombre</th>
                  <th className="px-3 py-1 font-medium">Categoría</th>
                  <th className="px-3 py-1 text-right font-medium">Precio vta</th>
                  <th className="px-3 py-1 text-right font-medium">Costo u.</th>
                  <th className="px-3 py-1 text-right font-medium">Stock</th>
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((r, i) => {
                  const done = rows[i];
                  return (
                    <tr key={`${r.barcode}-${i}`} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono text-xs">{r.barcode || "—"}</td>
                      <td className="max-w-[280px] truncate px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5 text-muted">{r.category}</td>
                      <td className="num px-3 py-1.5 text-right">
                        {done ? formatARS(done.price) : r.priceRaw || "—"}
                      </td>
                      <td className="num px-3 py-1.5 text-right">
                        {done ? (done.cost == null ? "—" : formatARS(done.cost)) : r.costRaw || "—"}
                      </td>
                      <td className="num px-3 py-1.5 text-right">
                        {done ? (r.stockRaw.trim() ? String(done.stock) : "—") : r.stockRaw || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            className={cn(
              "mt-3 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-md bg-bg",
              dropOver && "ring-2 ring-sage",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDropOver(true);
            }}
            onDragLeave={() => setDropOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropOver(false);
              const f = e.dataTransfer.files[0];
              if (f) void readFile(f);
            }}
          >
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              Seleccionar archivo
            </Button>
            <p className="text-sm text-muted">Soltá el archivo acá</p>
          </div>
        )}
        <div className="mt-3 flex shrink-0 justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!rows.length || !format}
            onClick={() => {
              if (!format || !rows.length) return;
              onApply(rows);
              onOpenChange(false);
            }}
          >
            Confirmar {rows.length ? `(${rows.length})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExportDialog({
  open,
  onOpenChange,
  onCsv,
  onXlsx,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCsv: () => void;
  onXlsx: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exportar catálogo</DialogTitle>
          <DialogDescription>
            Código, nombre, categoría, precio vta, costo por unidad, stock y valor de stock (stock × costo u.).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" variant="secondary" onClick={onCsv}>
            CSV
          </Button>
          <Button className="flex-1" onClick={onXlsx}>
            Excel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortCodesDialog({
  open,
  onOpenChange,
  products,
  categories,
  store,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
  categories: { id: string; name: string }[];
  store: string;
  onSave: (p: Product) => void;
}) {
  const [productId, setProductId] = useState("");
  const [code, setCode] = useState("");
  const [alta, setAlta] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const coded = products
    .filter((p) => shortCodeOf(p) !== "")
    .sort((a, b) => {
      const na = Number(shortCodeOf(a));
      const nb = Number(shortCodeOf(b));
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return shortCodeOf(a).localeCompare(shortCodeOf(b), "es", { numeric: true });
    });
  const free = products.filter((p) => p.active && shortCodeOf(p) === "").sort((a, b) => a.name.localeCompare(b.name, "es"));

  function takenBy(raw: string, exceptId?: string) {
    const c = raw.trim();
    if (c === "") return null;
    return products.find((p) => p.id !== exceptId && shortCodeOf(p).toLowerCase() === c.toLowerCase()) ?? null;
  }

  function assign() {
    setErr(null);
    const c = code.trim();
    if (c === "") {
      setErr("Poné un código. El 0 vale.");
      return;
    }
    const clash = takenBy(c, alta ? undefined : productId);
    if (clash) {
      setErr(`Ese código ya lo tiene ${clash.name}`);
      return;
    }
    if (alta) {
      const name = newName.trim();
      if (!name) {
        setErr("Falta el nombre");
        return;
      }
      onSave({
        id: uid("p"),
        name,
        barcode: "",
        shortCode: c,
        price: Number(newPrice) || 0,
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
      setNewName("");
      setNewPrice("");
      setCode("");
      toast.success(`${c} · ${name}`);
      return;
    }
    const p = products.find((x) => x.id === productId);
    if (!p) {
      setErr("Elegí un producto");
      return;
    }
    onSave({ ...p, shortCode: c });
    setCode("");
    setProductId("");
    toast.success(`${c} · ${p.name}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setErr(null);
          setAlta(false);
          setCode("");
        }
      }}
    >
      <DialogContent className="w-[min(560px,calc(100vw-24px))]">
        <DialogHeader>
          <DialogTitle>Códigos personalizados</DialogTitle>
          <DialogDescription>
            Para lo que no tiene barras. El corto no pisa el EAN. Un código, un producto.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5">
          <button
            type="button"
            className={cn("h-8 rounded-full px-3 text-xs font-medium", !alta ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
            onClick={() => setAlta(false)}
          >
            Elegir producto
          </button>
          <button
            type="button"
            className={cn("h-8 rounded-full px-3 text-xs font-medium", alta ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
            onClick={() => setAlta(true)}
          >
            Alta rápida
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
          {alta ? (
            <>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre" />
              <Input inputMode="numeric" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="Precio" />
            </>
          ) : (
            <select
              className="col-span-2 flex h-11 w-full rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)]"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Producto</option>
              {free.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="0"
            aria-label="Código corto"
            className={alta ? "" : "sm:col-start-1"}
          />
          <Button onClick={assign}>Asignar</Button>
        </div>
        {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
        <div className="mt-3 max-h-64 overflow-y-auto rounded-md bg-bg">
          {coded.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-subtle">Todavía no hay códigos cortos.</p>
          ) : (
            <ul>
              {coded.map((p) => (
                <li key={p.id} className="flex items-center gap-3 border-b border-border px-3 py-2 text-sm">
                  <span className="num w-10 shrink-0 text-lg font-medium">{shortCodeOf(p)}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-danger"
                    onClick={() => {
                      onSave({ ...p, shortCode: "" });
                      toast("Código quitado");
                    }}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            variant="secondary"
            disabled={!coded.length}
            onClick={() => {
              if (
                printShortCodeSheet(
                  coded.map((p) => ({ code: shortCodeOf(p), name: p.name })),
                  store,
                )
              ) {
                toast.success("Hoja de códigos");
              }
            }}
          >
            <Printer className="size-4" />
            Imprimir lista
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LabelsDialog({
  open,
  onOpenChange,
  products,
  categories,
  store,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
  categories: { id: string; name: string }[];
  store: string;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | "all">("all");
  const list = products.filter((p) => {
    if (!p.active) return false;
    if (cat !== "all" && p.categoryId !== cat) return false;
    return productMatchesQuery(p, q);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Etiquetas</DialogTitle>
          <DialogDescription>Góndola en tres columnas o lista con encabezado amarillo.</DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className={cn("h-8 rounded-full px-3 text-xs", cat === "all" ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
            onClick={() => setCat("all")}
          >
            Todas
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cn("h-8 rounded-full px-3 text-xs", cat === c.id ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
              onClick={() => setCat(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-subtle">{list.length} productos</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              if (printGondolaLabels(list, store)) toast.success("Góndola lista");
            }}
          >
            <Printer className="size-4" />
            Góndola
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (printListaLabels(list, store)) toast.success("Lista lista");
            }}
          >
            <Printer className="size-4" />
            Lista
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
