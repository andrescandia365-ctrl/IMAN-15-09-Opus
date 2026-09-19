import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Eye, ListChecks, Pencil, Plus, Printer, Search, Truck, X } from "lucide-react";
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
import { formatARS, formatDate, weekdayMon1 } from "@/lib/format";
import { findByScan, lineLabel, lineUnits, packOf, receiveSummary, waHref } from "@/lib/pack";
import { BoletaCostoDialog, CostoEnLlegada, ScanPedidoField } from "@/components/costo-boleta";
import { costoAGondola, orderLineKey } from "@/lib/receive-cost";
import type { InvoiceKind } from "@/lib/pricing";
import { printSlip } from "@/lib/print";
import { orderCost } from "@/lib/suggest";
import { useCashSnapshot, useImanStore } from "@/lib/store";
import { supplierMatchesDay } from "@/lib/supplier-cadence";
import type { Category, OrderDraft, Product, Settings, Supplier } from "@/lib/types";
import { cn, uid } from "@/lib/utils";
import { ProveedorRefundDialog } from "@/components/refunds";
import { useDragScroll } from "@/lib/drag-scroll";

const DAYS: { n: number; label: string }[] = [
  { n: 1, label: "Lunes" },
  { n: 2, label: "Martes" },
  { n: 3, label: "Miércoles" },
  { n: 4, label: "Jueves" },
  { n: 5, label: "Viernes" },
  { n: 6, label: "Sábado" },
  { n: 7, label: "Domingo" },
];

function catsOf(s: Supplier): string[] {
  return s.categoryIds ?? [];
}

export function OrdersView() {
  const suppliers = useImanStore((s) => s.suppliers);
  const products = useImanStore((s) => s.products);
  const categories = useImanStore((s) => s.categories);
  const orders = useImanStore((s) => s.orders);
  const generateOrder = useImanStore((s) => s.generateOrder);
  const addOrderLine = useImanStore((s) => s.addOrderLine);
  const setOrderLineQty = useImanStore((s) => s.setOrderLineQty);
  const saveSupplier = useImanStore((s) => s.saveSupplier);
  const deleteSupplier = useImanStore((s) => s.deleteSupplier);
  const markOrderSent = useImanStore((s) => s.markOrderSent);
  const receiveOrder = useImanStore((s) => s.receiveOrder);
  const receiveOrderUnits = useImanStore((s) => s.receiveOrderUnits);
  const settings = useImanStore((s) => s.settings);
  const cash = useCashSnapshot();
  const today = weekdayMon1();
  const [day, setDay] = useState(today);
  const [craftId, setCraftId] = useState<string | null>(null);
  const [mode, setMode] = useState<"arm" | "receive">("arm");
  const [regOpen, setRegOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [retId, setRetId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [finishOpen, setFinishOpen] = useState(false);
  const [seeId, setSeeId] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const catalogRef = useDragScroll<HTMLUListElement>();
  const blankForm = {
    name: "",
    whatsapp: "",
    notes: "",
    days: [today] as number[],
    orderDays: [today] as number[],
    categoryIds: [] as string[],
    cadence: "weekly" as "weekly" | "monthly",
    monthOrderDays: [null] as (number | null)[],
    monthDeliverDays: [null] as (number | null)[],
    invoiceType: "" as "" | "A" | "X",
  };
  const [form, setForm] = useState(blankForm);

  const ofDay =
    day === 0
      ? suppliers
      : suppliers.filter((s) => supplierMatchesDay(s, day));
  const craft = suppliers.find((s) => s.id === craftId) ?? null;
  const draft =
    mode === "receive"
      ? orders.find((o) => o.supplierId === craftId && !o.received)
      : orders.find((o) => o.supplierId === craftId && !o.sent);
  const cost = draft ? orderCost(draft.lines, products) : 0;
  const rent = (settings.monthExpenses ?? []).filter((e) => e.amount > 0);
  const enCamino = orders.filter((o) => o.sent && !o.received);
  const catNames = (ids: string[]) =>
    ids
      .map((id) => categories.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(" · ");

  const catalog = useMemo(() => {
    if (!craft) return [];
    const ids = catsOf(craft);
    const pool = products.filter((p) => p.active && (ids.length ? ids.includes(p.categoryId) : true));
    const needle = q.trim().toLowerCase();
    return needle
      ? pool.filter((p) => p.name.toLowerCase().includes(needle) || p.barcode.includes(needle)).slice(0, 40)
      : pool.filter((p) => p.stock <= p.stockMin).slice(0, 40);
  }, [craft, products, q]);

  function arm(id: string) {
    generateOrder(id);
    setMode("arm");
    setCraftId(id);
    setQ("");
  }

  function receiveSin(id: string) {
    generateOrder(id);
    setMode("receive");
    setCraftId(id);
    setQ("");
  }

  function openNew() {
    setEditId(null);
    setForm({ ...blankForm, days: [today], orderDays: [today] });
    setRegOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditId(s.id);
    setForm({
      name: s.name,
      whatsapp: s.whatsapp,
      notes: s.notes,
      days: [...s.days],
      orderDays: [...(s.orderDays ?? s.days)],
      categoryIds: [...catsOf(s)],
      cadence: s.cadence === "monthly" ? "monthly" : "weekly",
      monthOrderDays: (s.monthOrderDays ?? []).length ? [...s.monthOrderDays!] : [null],
      monthDeliverDays: (s.monthDays ?? []).length ? [...s.monthDays!] : [null],
      invoiceType: s.invoiceType === "A" || s.invoiceType === "X" ? s.invoiceType : "",
    });
    setRegOpen(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDay(0)}
              className={cn(
                "h-10 shrink-0 rounded-full px-4 text-sm font-medium",
                day === 0 ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
              )}
            >
              Todos
            </button>
            <div className="inline-flex shrink-0 items-center rounded-full bg-elevated p-1 shadow-[var(--shadow-border)]">
              {DAYS.map((d) => (
                <button
                  key={d.n}
                  type="button"
                  onClick={() => setDay(d.n)}
                  className={cn(
                    "relative h-9 rounded-full px-3 text-sm font-medium",
                    day === d.n ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {d.label}
                  {d.n === today ? (
                    <span
                      aria-label="hoy"
                      className={cn(
                        "absolute left-1/2 top-1 size-1 -translate-x-1/2 rounded-full",
                        day === d.n ? "bg-accent-fg" : "bg-accent",
                      )}
                    />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">
              Proveedores <span className="num text-muted">{ofDay.length}</span>
            </p>
            <Button size="sm" variant="secondary" className="shrink-0" onClick={openNew}>
              <Plus className="size-4" />
              Registrar proveedor
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {ofDay.length === 0 ? (
              <p className="rounded-xl bg-surface px-4 py-10 text-center text-sm text-subtle shadow-[var(--shadow-border)]">
                Nadie pide ni entrega este día.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {ofDay.map((s) => {
                  const pending = orders.find((o) => o.supplierId === s.id && !o.sent);
                  const pide = (s.orderDays ?? s.days).includes(day);
                  const llega = s.days.includes(day);
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 rounded-xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]"
                    >
                      <div className="min-w-0 flex-[2] basis-0">
                        <div className="flex items-center gap-1">
                          <p className="truncate font-display text-2xl tracking-tight">{s.name}</p>
                          <button
                            type="button"
                            className="grid size-8 shrink-0 place-items-center rounded-sm text-muted hover:bg-elevated hover:text-fg"
                            onClick={() => openEdit(s)}
                            aria-label={`Editar ${s.name}`}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        </div>
                        <p className="truncate text-xs text-subtle">
                          {catNames(catsOf(s)) || s.notes || "Sin rubro"}
                          {s.whatsapp ? ` · ${s.whatsapp}` : ""}
                        </p>
                        <p className="mt-1 text-sm font-medium text-muted">
                          {day === 0
                            ? `Pide ${DAYS.filter((d) => (s.orderDays ?? s.days).includes(d.n)).map((d) => d.label).join(", ") || "—"} · Entrega ${DAYS.filter((d) => s.days.includes(d.n)).map((d) => d.label).join(", ") || "—"}`
                            : `${pide ? "Hoy se levanta el pedido" : ""}${pide && llega ? " · " : ""}${llega ? "Hoy entrega" : ""}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="inline-flex h-9 items-center rounded-md bg-elevated px-2.5 text-xs font-medium text-muted shadow-[var(--shadow-border)]">
                          {pending ? "Armado" : "Sin armar"}
                        </span>
                        <Button size="sm" variant="secondary" className="px-2.5" onClick={() => setRetId(s.id)}>
                          Devolver mercadería
                        </Button>
                        <Button size="sm" variant="secondary" className="px-2.5" onClick={() => receiveSin(s.id)}>
                          Sumar a stock
                        </Button>
                        <Button onClick={() => arm(s.id)}>Armar pedido</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="flex items-center gap-2 font-display text-xl tracking-tight">
            <Truck className="size-4" />
            Pedidos en camino
          </h2>
          <p className="text-xs text-subtle">Cuando llega, el stock se actualiza.</p>
          <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
            {enCamino.length === 0 ? (
              <li className="py-8 text-center text-sm text-subtle">
                Nada en viaje. Si pediste en la web del proveedor, usá Sumar a stock.
              </li>
            ) : (
              enCamino.map((o) => (
                <li key={o.id} className="rounded-md bg-bg px-3 py-3">
                  <p className="font-medium">{o.supplierName || "Pedido"}</p>
                  <p className="text-[11px] text-subtle">{o.lines.length} líneas</p>
                  {o.liftAt || o.deliverAt ? (
                    <p className="text-[11px] text-muted">
                      {o.liftAt ? `Levanta ${formatDate(`${o.liftAt}T12:00:00`)}` : ""}
                      {o.liftAt && o.deliverAt ? " · " : ""}
                      {o.deliverAt ? `Entrega ${formatDate(`${o.deliverAt}T12:00:00`)}` : ""}
                    </p>
                  ) : null}
                  <Button
                    className="mt-2 w-full"
                    size="sm"
                    variant="secondary"
                    onClick={() => setSeeId(o.id)}
                  >
                    <Eye className="size-4" />
                    Ver pedido
                  </Button>
                  <Button
                    className="mt-2 w-full"
                    size="sm"
                    onClick={() => {
                      receiveOrder(o.id);
                      toast.success(receiveSummary(o.lines, products) || "Stock actualizado");
                    }}
                  >
                    Llegó · sumar stock
                  </Button>
                  <Button
                    className="mt-2 w-full"
                    size="sm"
                    variant="secondary"
                    onClick={() => setReviewId(o.id)}
                  >
                    <ListChecks className="size-4" />
                    Revisar llegada
                  </Button>
                </li>
              ))
            )}
          </ul>
        </section>
        </div>
      </div>

      <Dialog
        open={Boolean(craft)}
        onOpenChange={(o) => {
          if (!o) {
            setCraftId(null);
            setQ("");
          }
        }}
      >
        <DialogContent className="flex h-[min(80dvh,44rem)] w-[min(56rem,calc(100vw-48px))] max-w-none flex-col overflow-hidden p-6">
          <DialogHeader className="mb-5 shrink-0 pr-10">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">
              {mode === "receive" ? "Llegó" : "Armar"}
            </p>
            <DialogTitle className="mt-1 font-display text-3xl leading-none tracking-tight">
              {craft?.name}
            </DialogTitle>
            <DialogDescription>
              {mode === "receive"
                ? "Pediste afuera o no hay nota en IMAN. Cargá lo que entra y sumá stock."
                : craft
                  ? catNames(catsOf(craft)) || "Pedido"
                  : "Pedido"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden sm:grid-cols-2">
            <div className="flex min-h-0 flex-col">
              <div className="relative shrink-0">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Nombre o código · un click agrega"
                  className="h-12 bg-paper pl-11 text-base text-ink placeholder:text-ink-muted"
                />
              </div>
              <ul ref={catalogRef} className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
                {catalog.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-elevated/80">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate rounded-md px-2 py-2.5 text-left"
                      onClick={() => {
                        if (craft) addOrderLine(craft.id, p.id, 1, packOf(p) <= 1);
                      }}
                    >
                      <span className="block truncate text-base font-medium tracking-tight">{p.name}</span>
                      <span className="num mt-0.5 block text-xs text-subtle">{p.stock} u.</span>
                    </button>
                    <button
                      type="button"
                      className="h-11 min-w-11 shrink-0 rounded-md bg-elevated px-3 text-sm font-medium"
                      onClick={() => craft && addOrderLine(craft.id, p.id, 1, true)}
                    >
                      +u
                    </button>
                    {packOf(p) > 1 ? (
                      <button
                        type="button"
                        className="h-11 min-w-11 shrink-0 rounded-md bg-elevated px-3 text-sm font-medium"
                        onClick={() => craft && addOrderLine(craft.id, p.id, 1, false)}
                      >
                        +pack
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-paper p-3 text-ink shadow-[var(--shadow-ticket)] ticket-grain">
              <p className="shrink-0 text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">Pedido</p>
              {draft?.lines.length ? (
                <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
                  {draft.lines.map((l) => {
                    const p = products.find((x) => x.id === l.productId);
                    return (
                      <li
                        key={`${l.productId}-${l.asUnit ? "u" : "p"}`}
                        className="flex items-center gap-3 rounded-md px-1 py-1"
                      >
                        <span className="min-w-0 flex-1 truncate text-base font-medium tracking-tight">
                          {l.name}
                        </span>
                        <span className="num shrink-0 text-sm text-ink-muted">{lineLabel(p, l.qty, l.asUnit)}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            className="grid size-11 place-items-center rounded-md bg-ink/10 text-lg leading-none"
                            onClick={() => setOrderLineQty(draft.id, l.productId, l.qty - 1, Boolean(l.asUnit))}
                          >
                            −
                          </button>
                          <span className="num w-8 text-center text-lg">{l.qty}</span>
                          <button
                            type="button"
                            className="grid size-11 place-items-center rounded-md bg-ink/10 text-lg leading-none"
                            onClick={() => setOrderLineQty(draft.id, l.productId, l.qty + 1, Boolean(l.asUnit))}
                          >
                            +
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-6 flex-1 text-sm text-ink-muted">Buscá y tocá para armar el pedido.</p>
              )}
            </div>
          </div>
          {rent.length && mode === "arm" ? (
            <p className="mt-3 shrink-0 text-xs text-warn">
              No olvidar: {rent.map((e) => `${e.name} ${formatARS(e.amount)}`).join(" · ")}
            </p>
          ) : null}
          <div className="mt-4 flex shrink-0 items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Costo estimado <span className="num text-base text-fg">{formatARS(cost)}</span>
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setCraftId(null)}>
                Seguir después
              </Button>
              {draft && mode === "receive" ? (
                <Button
                  onClick={() => {
                    receiveOrder(draft.id);
                    toast.success(receiveSummary(draft.lines, products) || "Stock actualizado");
                    setCraftId(null);
                  }}
                >
                  Sumar al stock
                </Button>
              ) : null}
              {draft && mode === "arm" ? (
                <Button onClick={() => setFinishOpen(true)}>Finalizar pedido</Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar pedido</DialogTitle>
            <DialogDescription>
              {(() => {
                const fuerte = cash.drops ?? 0;
                const combined = cash.cajaChica + fuerte;
                const lack = Math.max(0, cost - combined);
                return lack > 0
                  ? `Chica ${formatARS(cash.cajaChica)} + fuerte ${formatARS(fuerte)} = ${formatARS(combined)}. Faltan ${formatARS(lack)}.`
                  : `Chica ${formatARS(cash.cajaChica)} + fuerte ${formatARS(fuerte)} cubren el pedido.`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            {draft ? (
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(draft.text);
                    toast.success("Nota copiada · pegala en la web del proveedor");
                  } catch {
                    toast.error("No se pudo copiar");
                  }
                }}
              >
                <Copy className="size-4" />
                Copiar
              </Button>
            ) : null}
            {draft ? (
              <Button
                variant="secondary"
                onClick={() => {
                  const ok = printSlip(`${settings.name} · ${craft?.name ?? ""}`, draft.text.split("\n"));
                  if (!ok) toast.error("El navegador bloqueó la impresión");
                }}
              >
                <Printer className="size-4" />
                Imprimir
              </Button>
            ) : null}
            {draft && craft && waHref(craft.whatsapp, draft.text) ? (
              <Button
                variant="secondary"
                onClick={() => {
                  const href = waHref(craft.whatsapp, draft.text);
                  if (href) window.open(href, "_blank", "noopener,noreferrer");
                  markOrderSent(draft.id);
                  toast.success("WhatsApp · queda en camino");
                  setFinishOpen(false);
                  setCraftId(null);
                }}
              >
                WhatsApp
              </Button>
            ) : null}
            {draft ? (
              <Button
                onClick={() => {
                  markOrderSent(draft.id);
                  toast.success("En camino");
                  setFinishOpen(false);
                  setCraftId(null);
                }}
              >
                En camino
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => {
                setFinishOpen(false);
              }}
            >
              Seguir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(seeId)} onOpenChange={(o) => !o && setSeeId(null)}>
        {(() => {
          const o = enCamino.find((x) => x.id === seeId);
          const when = [
            o?.liftAt ? `Levanta ${formatDate(`${o.liftAt}T12:00:00`)}` : "",
            o?.deliverAt ? `Entrega ${formatDate(`${o.deliverAt}T12:00:00`)}` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <DialogContent className="flex max-h-[80dvh] w-[min(56rem,calc(100vw-48px))] max-w-none flex-col overflow-hidden p-6">
              <DialogHeader className="mb-5 shrink-0 pr-10">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Pedido</p>
                <DialogTitle className="mt-1 font-display text-3xl leading-none tracking-tight">
                  {o?.supplierName || "Pedido"}
                </DialogTitle>
                <DialogDescription>{when || "Sin fecha de levante ni entrega."}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-paper p-3 text-ink shadow-[var(--shadow-ticket)] ticket-grain">
                {!o ? null : !o.lines.length ? (
                  <p className="px-2 py-8 text-center text-sm text-ink-muted">
                    No hay productos en este pedido.
                  </p>
                ) : (
                  <ul className="max-h-[min(28rem,50dvh)] space-y-1 overflow-y-auto">
                    {o.lines.map((l, i) => {
                      const p = products.find((x) => x.id === l.productId);
                      return (
                        <li
                          key={`${l.productId}-${l.asUnit ? "u" : "p"}-${i}`}
                          className="flex items-center gap-3 rounded-md px-2 py-2.5"
                        >
                          <span className="min-w-0 flex-1 truncate text-base font-medium tracking-tight">
                            {l.name || p?.name || "Producto"}
                          </span>
                          <span className="num shrink-0 text-sm text-ink-muted">{lineLabel(p, l.qty, l.asUnit)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="mt-4 flex shrink-0 justify-end">
                <Button variant="secondary" onClick={() => setSeeId(null)}>
                  Cerrar
                </Button>
              </div>
            </DialogContent>
          );
        })()}
      </Dialog>

      <ReviewArrivalDialog
        order={enCamino.find((o) => o.id === reviewId) ?? null}
        products={products}
        suppliers={suppliers}
        categories={categories}
        settings={settings}
        onClose={() => setReviewId(null)}
        onConfirm={(receipts) => {
          const order = enCamino.find((o) => o.id === reviewId);
          if (!order) return;
          const r = receiveOrderUnits(order.id, receipts);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          const expected = order.lines.map((l) => {
            const p = products.find((x) => x.id === l.productId);
            return lineUnits(p, l.qty, l.asUnit);
          });
          const got = receipts.map((x) => x.units);
          const missing = got.filter((u) => u <= 0).length;
          const short = got.some((u, i) => u > 0 && u < (expected[i] ?? 0));
          const sum = got.reduce((a, u) => a + u, 0);
          if (!sum) toast.success("Anotado. No entró mercadería.");
          else if (missing || short) {
            toast.success(
              missing
                ? `Stock de lo que llegó · faltó ${missing} ${missing === 1 ? "renglón" : "renglones"}`
                : "Stock de lo que llegó · pedido a medias",
            );
          } else toast.success(receiveSummary(order.lines, products) || "Stock actualizado");
          setReviewId(null);
        }}
      />

      <Dialog
        open={regOpen}
        onOpenChange={(v) => {
          setRegOpen(v);
          if (!v) setEditId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Editar proveedor" : "Registrar proveedor"}</DialogTitle>
            <DialogDescription>Nombre, Fac A o Fac X, rubro y días. Sin factura no se recalcula el precio.</DialogDescription>
          </DialogHeader>
          <Label>Nombre</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Label className="mt-3">Factura</Label>
          <div className="mt-1 flex gap-2">
            {(["X", "A"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={cn(
                  "h-11 flex-1 rounded-md text-sm font-medium",
                  form.invoiceType === k ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
                )}
                onClick={() => setForm((f) => ({ ...f, invoiceType: k }))}
              >
                Fac {k}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-subtle">Obligatorio. IMAN usa esto para el precio de góndola, no es un segundo precio.</p>
          <Label className="mt-2">WhatsApp</Label>
          <Input
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            placeholder="11 5555-1234"
          />
          <Label className="mt-2">Categorías que trae</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    categoryIds: f.categoryIds.includes(c.id)
                      ? f.categoryIds.filter((x) => x !== c.id)
                      : [...f.categoryIds, c.id],
                  }))
                }
                className={cn(
                  "h-8 rounded-full px-3 text-xs",
                  form.categoryIds.includes(c.id) ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          {/* Lo mismo que lee invoiceForProduct: sin rubros guardados, trae todo. */}
          {form.categoryIds.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted">Sin rubros: para la factura cuenta como que trae de todo.</p>
          ) : null}
          <Label className="mt-3">Cadencia</Label>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              className={cn(
                "h-10 flex-1 rounded-md text-sm",
                form.cadence !== "monthly" ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
              )}
              onClick={() => setForm((f) => ({ ...f, cadence: "weekly" }))}
            >
              Semanal
            </button>
            <button
              type="button"
              className={cn(
                "h-10 flex-1 rounded-md text-sm",
                form.cadence === "monthly" ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
              )}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  cadence: "monthly",
                  monthOrderDays: f.monthOrderDays.length ? f.monthOrderDays : [null],
                  monthDeliverDays: f.monthDeliverDays.length ? f.monthDeliverDays : [null],
                }))
              }
            >
              Mensual
            </button>
          </div>
          {form.cadence === "monthly" ? (
            <div className="mt-3 space-y-4">
              <MonthDayBlock
                title="Levanta pedido"
                hint="El día del mes en que se arma. Ej. el 5, todos los meses."
                days={form.monthOrderDays}
                onChange={(monthOrderDays) => setForm((f) => ({ ...f, monthOrderDays }))}
              />
              <MonthDayBlock
                title="Entrega pedido"
                hint="El día del mes en que llega el camión. Ej. el 8."
                days={form.monthDeliverDays}
                onChange={(monthDeliverDays) => setForm((f) => ({ ...f, monthDeliverDays }))}
              />
            </div>
          ) : (
            <>
          <Label className="mt-3">Día que se levanta el pedido</Label>
          <DayChips
            value={form.orderDays}
            onChange={(orderDays) => setForm((f) => ({ ...f, orderDays }))}
          />
          <Label className="mt-2">Día que entregan</Label>
          <DayChips value={form.days} onChange={(days) => setForm((f) => ({ ...f, days }))} />
            </>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {editId ? (
              <Button
                variant="secondary"
                className="mr-auto text-danger"
                onClick={() => {
                  deleteSupplier(editId);
                  setRegOpen(false);
                  setEditId(null);
                  if (craftId === editId) setCraftId(null);
                  toast.success("Proveedor quitado");
                }}
              >
                Quitar
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setRegOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const name = form.name.trim();
                if (!name) return;
                if (form.invoiceType !== "A" && form.invoiceType !== "X") {
                  toast.error("Elegí Fac A o Fac X");
                  return;
                }
                const monthOrderDays = cleanMonthDays(form.monthOrderDays);
                const monthDeliverDays = cleanMonthDays(form.monthDeliverDays);
                if (form.cadence === "monthly" && (!monthOrderDays.length || !monthDeliverDays.length)) {
                  toast.error("En mensual hace falta el día que levanta y el día que entrega");
                  return;
                }
                const wasEdit = Boolean(editId);
                const s: Supplier = {
                  id: editId ?? uid("s"),
                  name,
                  whatsapp: form.whatsapp.trim(),
                  notes: form.notes,
                  days: form.days.length ? form.days : [today],
                  orderDays: form.orderDays.length ? form.orderDays : form.days,
                  categoryIds: form.categoryIds,
                  cadence: form.cadence,
                  monthDays: form.cadence === "monthly" ? monthDeliverDays : [],
                  monthOrderDays: form.cadence === "monthly" ? monthOrderDays : [],
                  invoiceType: form.invoiceType,
                };
                saveSupplier(s);
                setRegOpen(false);
                setEditId(null);
                setForm({ ...blankForm, days: [today], orderDays: [today] });
                toast.success(wasEdit ? "Proveedor actualizado" : "Proveedor listo");
              }}
            >
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ProveedorRefundDialog
        open={Boolean(retId)}
        onOpenChange={(v) => !v && setRetId(null)}
        supplier={suppliers.find((s) => s.id === retId) ?? null}
      />
    </div>
  );
}

function ReviewArrivalDialog({
  order,
  products,
  suppliers,
  categories,
  settings,
  onClose,
  onConfirm,
}: {
  order: OrderDraft | null;
  products: Product[];
  suppliers: Supplier[];
  categories: Category[];
  settings: Settings;
  onClose: () => void;
  onConfirm: (
    receipts: {
      productId: string;
      units: number;
      asUnit?: boolean;
      cost?: number | null;
      desdeBulto?: boolean;
    }[],
  ) => void;
}) {
  type Mark = { status: "ok" | "missing" | "partial"; units: string; costo: string; bulto: string };
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [scan, setScan] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [ejemplo, setEjemplo] = useState<InvoiceKind | null>(null);
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    setMarks({});
    setScan("");
    setFocusKey(null);
  }, [order?.id]);

  const rows = useMemo(() => {
    if (!order) return [];
    return order.lines.map((l, i) => {
      const p = products.find((x) => x.id === l.productId);
      const expected = lineUnits(p, l.qty, l.asUnit);
      return { key: orderLineKey(l, i), line: l, product: p, expected };
    });
  }, [order, products]);

  function got(key: string, expected: number): number {
    const m = marks[key];
    if (!m || m.status === "missing") return 0;
    if (m.status === "ok") return expected;
    return Math.max(0, Math.floor(Number(m.units) || 0));
  }

  function setStatus(key: string, status: Mark["status"], expected: number) {
    setMarks((cur) => ({
      ...cur,
      [key]: {
        status,
        units: status === "ok" ? String(expected) : status === "missing" ? "0" : cur[key]?.units ?? "",
        costo: cur[key]?.costo ?? "",
        bulto: cur[key]?.bulto ?? "",
      },
    }));
  }

  function findLine(raw: string): boolean {
    const hit = findByScan(products, raw);
    if (!hit) return false;
    const row = rows.find((r) => r.line.productId === hit.product.id);
    if (!row) {
      toast.error("No está en este pedido");
      return false;
    }
    setFocusKey(row.key);
    rowRefs.current[row.key]?.scrollIntoView({ block: "nearest" });
    toast(row.line.name || hit.product.name);
    return true;
  }

  return (
    <>
    <Dialog
      open={Boolean(order)}
      onOpenChange={(o) => {
        if (!o) {
          setMarks({});
          onClose();
        }
      }}
    >
      <DialogContent className="flex max-h-[80dvh] w-[min(56rem,calc(100vw-48px))] max-w-none flex-col overflow-hidden p-6">
        <DialogHeader className="mb-5 shrink-0 pr-10">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Revisar llegada</p>
          <DialogTitle className="mt-1 font-display text-3xl leading-none tracking-tight">
            {order?.supplierName || "Pedido"}
          </DialogTitle>
          <DialogDescription>
            Contra este pedido. Llegó, faltó o a medias. El costo de la boleta es opcional.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-paper p-3 text-ink shadow-[var(--shadow-ticket)] ticket-grain">
          {!order ? null : !rows.length ? (
            <p className="px-2 py-8 text-center text-sm text-ink-muted">No hay renglones en este pedido.</p>
          ) : (
            <>
              <ScanPedidoField value={scan} onChange={setScan} onScan={findLine} ticket />
              <ul className="max-h-[min(28rem,50dvh)] space-y-1 overflow-y-auto">
                {rows.map((row) => {
                  const m = marks[row.key];
                  const units = got(row.key, row.expected);
                  const full = m?.status === "ok" || units >= row.expected;
                  const partial = m?.status === "partial" || (!full && units > 0);
                  const costoN = m?.costo ? Number(m.costo) : 0;
                  const patch =
                    row.product && costoN > 0
                      ? costoAGondola(row.product, costoN, categories, suppliers, settings, {
                          desdeBulto: Boolean(m?.bulto),
                        })
                      : null;
                  return (
                    <li
                      key={row.key}
                      ref={(el) => {
                        rowRefs.current[row.key] = el;
                      }}
                      className={cn("rounded-md px-2 py-2", focusKey === row.key && "bg-dato/40")}
                    >
                      <p className="truncate text-base font-medium tracking-tight">
                        {row.line.name || row.product?.name || "Producto"}
                      </p>
                      <p className="num mt-0.5 text-sm text-ink-muted">
                        Pedido {lineLabel(row.product, row.line.qty, row.line.asUnit)}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {(
                          [
                            ["ok", "Llegó"],
                            ["missing", "Faltó"],
                            ["partial", "A medias"],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setStatus(row.key, id, row.expected)}
                            className={cn(
                              "h-11 rounded-md text-sm font-medium",
                              m?.status === id ? "bg-accent text-accent-fg" : "bg-ink/8 text-ink-muted",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {m && m.status === "partial" ? (
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-xs text-ink-muted">u. que llegaron</label>
                          <Input
                            inputMode="numeric"
                            value={m.units}
                            placeholder="0"
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d]/g, "");
                              setMarks((cur) => ({
                                ...cur,
                                [row.key]: { ...m, units: raw },
                              }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.preventDefault();
                            }}
                            className="h-11 w-24 bg-paper text-ink"
                          />
                        </div>
                      ) : null}
                      <CostoEnLlegada
                        product={row.product}
                        suppliers={suppliers}
                        costo={m?.costo ?? ""}
                        bulto={m?.bulto ?? ""}
                        avisos={patch?.avisos ?? []}
                        precioNuevo={patch?.price ?? null}
                        ticket
                        onCosto={(v) =>
                          setMarks((cur) => ({
                            ...cur,
                            [row.key]: {
                              status: cur[row.key]?.status ?? "missing",
                              units: cur[row.key]?.units ?? "",
                              costo: v,
                              bulto: cur[row.key]?.bulto ?? "",
                            },
                          }))
                        }
                        onBulto={(v) =>
                          setMarks((cur) => ({
                            ...cur,
                            [row.key]: {
                              status: cur[row.key]?.status ?? "missing",
                              units: cur[row.key]?.units ?? "",
                              costo: cur[row.key]?.costo ?? "",
                              bulto: v,
                            },
                          }))
                        }
                        onScan={findLine}
                        onAskBoleta={setEjemplo}
                      />
                      {full || partial ? (
                        <p className="mt-1 text-[11px] text-ink-muted">{full ? "Llegó" : "A medias"}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Seguir
          </Button>
          <Button
            onClick={() => {
              if (!order) return;
              onConfirm(
                rows.map((row) => {
                  const m = marks[row.key];
                  const cost = m?.costo ? Number(m.costo) : null;
                  return {
                    productId: row.line.productId,
                    units: got(row.key, row.expected),
                    asUnit: row.line.asUnit,
                    cost: cost && cost > 0 ? cost : null,
                    desdeBulto: Boolean(m?.bulto),
                  };
                }),
              );
              setMarks({});
            }}
          >
            Sumar lo que llegó
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <BoletaCostoDialog openKind={ejemplo} onOpenKind={setEjemplo} />
    </>
  );
}

function DayChips({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {DAYS.map((d) => (
        <button
          key={d.n}
          type="button"
          onClick={() =>
            onChange(value.includes(d.n) ? value.filter((x) => x !== d.n) : [...value, d.n])
          }
          className={cn(
            "h-8 rounded-full px-3 text-xs",
            value.includes(d.n) ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
          )}
        >
          {d.label.slice(0, 3)}
        </button>
      ))}
    </div>
  );
}

function cleanMonthDays(days: (number | null)[]): number[] {
  const out: number[] = [];
  for (const n of days) {
    if (n == null || !Number.isInteger(n) || n < 1 || n > 31) continue;
    if (!out.includes(n)) out.push(n);
    if (out.length >= 4) break;
  }
  return out.sort((a, b) => a - b);
}

function dayToIso(day: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const d = Math.min(Math.max(1, day), last);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isoToDay(iso: string): number | null {
  const m = iso.match(/^\d{4}-\d{2}-(\d{2})$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > 31) return null;
  return n;
}

function MonthDayBlock({
  title,
  hint,
  days,
  onChange,
}: {
  title: string;
  hint: string;
  days: (number | null)[];
  onChange: (days: (number | null)[]) => void;
}) {
  const slots = days.length ? days : [null];
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-subtle">{hint}</p>
      <div className="mt-2 space-y-2">
        {slots.map((day, i) => (
          <div key={i} className="flex gap-2">
            <Input
              type="date"
              value={day ? dayToIso(day) : ""}
              onChange={(e) => {
                const next = [...slots];
                next[i] = isoToDay(e.target.value);
                onChange(next);
              }}
              aria-label={title}
            />
            {slots.length > 1 ? (
              <button
                type="button"
                className="grid size-11 shrink-0 place-items-center rounded-md bg-elevated text-muted"
                onClick={() => onChange(slots.filter((_, j) => j !== i))}
                aria-label="Quitar fecha"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {slots.length < 4 ? (
        <button
          type="button"
          className="mt-2 text-sm text-muted hover:text-fg"
          onClick={() => onChange([...slots, null])}
        >
          Otra fecha
        </button>
      ) : null}
    </div>
  );
}
