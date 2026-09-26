import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  Banknote,
  Clock,
  CreditCard,
  Minus,
  Plus,
  ScanBarcode,
  Search,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ClienteRefundDialog } from "@/components/refunds";
import { CameraScan } from "@/components/camera-scan";
import { SalesHistory } from "@/components/sales-history";
import { currentShiftKey, formatARS, todayKey } from "@/lib/format";
import { findByScan, productMatchesQuery, stockBreakdown } from "@/lib/pack";
import { useCashSnapshot, useCobro, useImanStore } from "@/lib/store";
import { PromosAplicadas } from "@/components/promo-ticket";
import { importeDeLinea, PROMO_NOMBRE, vigente, type Cobro } from "@/lib/promos";
import { sendOrQueueDeskTicket } from "@/lib/desk-outbox";
import { useDeskInbox } from "@/lib/desk-listen";
import { useRol, useTurnoAjeno } from "@/lib/caja-local";
import { usePhoneUi } from "@/lib/device";
import { useDragScroll } from "@/lib/drag-scroll";
import type { PayMethod, Product, TicketLine } from "@/lib/types";
import { mergeTicketLines } from "@/lib/ticket-merge";
import { cn } from "@/lib/utils";
import { errorText } from "@/lib/errors";

const CASH_KEYS = [10000, 20000];
const PACK_TOAST = "Eso es el bulto. Sumá stock en Inventario o Pedidos.";

function matches(p: Product, q: string) {
  return productMatchesQuery(p, q);
}

function stockTone(p: Product) {
  if (p.stock <= 0) return "text-danger";
  if (p.stock <= p.stockMin) return "text-warn";
  return "text-muted";
}

export function CounterView() {
  const search = useImanStore((s) => s.search);
  const setSearch = useImanStore((s) => s.setSearch);
  const products = useImanStore((s) => s.products);
  const categories = useImanStore((s) => s.categories);
  const categoryFilter = useImanStore((s) => s.categoryFilter);
  const setCategoryFilter = useImanStore((s) => s.setCategoryFilter);
  const selectedId = useImanStore((s) => s.selectedId);
  const selectProduct = useImanStore((s) => s.selectProduct);
  const addToTicket = useImanStore((s) => s.addToTicket);
  const ticket = useImanStore((s) => s.ticket);
  const setLineQty = useImanStore((s) => s.setLineQty);
  const removeLine = useImanStore((s) => s.removeLine);
  const clearTicket = useImanStore((s) => s.clearTicket);
  const payMethod = useImanStore((s) => s.payMethod);
  const setPayMethod = useImanStore((s) => s.setPayMethod);
  const paidInput = useImanStore((s) => s.paidInput);
  const setPaidInput = useImanStore((s) => s.setPaidInput);
  const checkout = useImanStore((s) => s.checkout);
  const cash = useCashSnapshot();
  const replaceTicket = useImanStore((s) => s.replaceTicket);
  const [elegirTicket, setElegirTicket] = useState(false);
  const deskStoreId = useImanStore((s) => s.deskStoreId);
  const phone = usePhoneUi();
  const cashFloat = useImanStore((s) => s.settings.cashFloat);
  const openShift = useImanStore((s) => s.openShift);

  function openCash() {
    if (!puedeCobrar || turnoAjeno) return;
    const r = openShift(cashFloat);
    if (!r.ok) toast.error(r.error);
    else toast.success("Caja abierta. Ya podés vender.");
  }

  const inputRef = useRef<HTMLInputElement>(null);
  const catsRef = useDragScroll<HTMLDivElement>();
  const listRef = useDragScroll<HTMLDivElement>();
  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const charging = useRef(false);
  // El rol decide los permisos; el ancho, la disposición (ver rol.ts). Si esta
  // PC deja de ser la caja con un ticket a medio cobrar, ese ticket se termina
  // de cobrar: nunca se corta una venta en el medio.
  const { rol, puedeCobrar } = useRol(deskStoreId);
  // Un turno de otro aparato en la caja (toma forzada): se cierra en Caja
  // contando la plata antes de cobrar en esta.
  const turnoAjeno = useTurnoAjeno(deskStoreId) && rol === "caja";
  const [gracia, setGracia] = useState(false);
  const pudoCobrar = useRef(puedeCobrar);
  useEffect(() => {
    if (pudoCobrar.current && !puedeCobrar && useImanStore.getState().ticket.length) setGracia(true);
    pudoCobrar.current = puedeCobrar;
  }, [puedeCobrar]);
  useEffect(() => {
    if (!ticket.length) setGracia(false);
  }, [ticket.length]);
  const cobra = puedeCobrar || gracia;
  const inbox = useDeskInbox(deskStoreId, puedeCobrar && Boolean(deskStoreId));

  // Lo que va a cobrar la caja, con las promos vigentes: lo mismo que checkout.
  const cobro = useCobro();
  const total = cobro.total;
  const paid = Number(paidInput) || 0;
  const change = payMethod === "efectivo" ? Math.max(0, paid - total) : 0;

  const filtered = useMemo(() => {
    return products
      .filter((p) => p.active)
      .filter((p) => categoryFilter === "all" || p.categoryId === categoryFilter)
      .filter((p) => matches(p, search))
      .slice(0, 40);
  }, [products, categoryFilter, search]);

  function confirm() {
    if (charging.current || !cobra || turnoAjeno) return;
    charging.current = true;
    setBusy(true);
    const r = checkout();
    charging.current = false;
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setPayOpen(false);
    toast.success("Venta registrada");
  }

  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "F4") {
        e.preventDefault();
        confirmRef.current();
      }
      if (e.key === "Escape") {
        setSearch("");
        selectProduct(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearch, selectProduct]);

  function tryAdd(id: string, qty = 1) {
    const r = addToTicket(id, qty);
    if (!r.ok) toast.error(r.error);
  }

  function scanCode(raw: string, opts?: { missing?: boolean }) {
    const scanned = findByScan(products, raw);
    if (!scanned) {
      if (opts?.missing !== false) toast.error(`No está: ${raw}`);
      return false;
    }
    if (scanned.kind === "pack") {
      toast.error(PACK_TOAST);
      setSearch("");
      return true;
    }
    tryAdd(scanned.product.id, 1);
    setSearch("");
    return true;
  }

  async function sendToDesk() {
    if (!ticket.length) {
      toast.error("Armá el ticket en el celular primero");
      return;
    }
    if (!deskStoreId) {
      toast.error("Abrí un local");
      return;
    }
    setSending(true);
    try {
      const result = await sendOrQueueDeskTicket({ storeId: deskStoreId, lines: ticket, payMethod, paid: null });
      clearTicket();
      setPayOpen(false);
      if (result === "queued") {
        toast("Sin red. El sobre espera. La venta en este aparato sigue.");
      } else {
        toast.success("Ticket mandado a la caja");
      }
    } catch (err) {
      toast.error(errorText(err, "No se pudo enviar"));
    } finally {
      setSending(false);
    }
  }

  async function loadIncoming() {
    // Con un ticket a medio cobrar no se reemplaza en silencio: se pregunta.
    if (useImanStore.getState().ticket.length) {
      setElegirTicket(true);
      return;
    }
    await traerDelCelu("reemplazar");
  }

  async function traerDelCelu(modo: "sumar" | "reemplazar") {
    setElegirTicket(false);
    const t = await inbox.accept();
    if (!t) return;
    if (modo === "sumar") {
      const cur = useImanStore.getState();
      replaceTicket(mergeTicketLines(cur.ticket, t.lines), {
        payMethod: cur.payMethod,
        paidInput: cur.paidInput,
      });
      toast.success("Sumado al ticket del mostrador");
      return;
    }
    replaceTicket(t.lines, {
      payMethod: t.payMethod,
      paidInput: t.paid != null ? String(t.paid) : "",
    });
    toast.success("Ticket del celular en el mostrador");
  }

  function onSearchKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const q = search.trim();
    if (!q && selectedId) {
      tryAdd(selectedId);
      return;
    }
    if (q && scanCode(q, { missing: false })) return;
    if (filtered.length === 1) {
      tryAdd(filtered[0]!.id);
      return;
    }
    if (filtered[0]) selectProduct(filtered[0].id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {!phone && inbox.incoming ? (
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-xl bg-sage/15 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Ticket del celular</p>
            <p className="text-xs text-muted">
              {inbox.incoming.lines.length} ítems · {formatARS(inbox.incoming.total)}. Llegó entero, la PC no pidió nada.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={() => inbox.dismiss()}>
              Después
            </Button>
            <Button size="sm" variant="paper" onClick={() => void loadIncoming()}>
              Poner en el mostrador
            </Button>
          </div>
        </div>
      ) : null}
      <Dialog open={elegirTicket && Boolean(inbox.incoming)} onOpenChange={setElegirTicket}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ya hay un ticket en el mostrador</DialogTitle>
            <DialogDescription>Elegí qué hacer con el ticket del celular.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <TicketResumen titulo="En el mostrador" lineas={ticket} total={total} />
            <TicketResumen
              titulo="Del celular"
              lineas={inbox.incoming?.lines ?? []}
              total={inbox.incoming?.total ?? 0}
            />
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setElegirTicket(false)}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={() => void traerDelCelu("reemplazar")}>
              Reemplazar
            </Button>
            <Button onClick={() => void traerDelCelu("sumar")}>Sumar al ticket</Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.72fr)_minmax(280px,0.78fr)] lg:grid-rows-1">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-surface p-3 shadow-[var(--shadow-border)] sm:p-4">
        <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            ref={inputRef}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Nombre o código · Enter agrega"
            className="h-12 pl-10 pr-20 text-base"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {phone ? (
            <button
              type="button"
              className="absolute right-10 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-sm text-muted hover:text-fg"
              onClick={() => setCamOpen(true)}
              aria-label="Cámara"
            >
              <ScanBarcode className="size-5" />
            </button>
          ) : null}
          {search ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-sm text-muted hover:text-fg"
              onClick={() => setSearch("")}
              aria-label="Limpiar"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="grid size-12 shrink-0 place-items-center rounded-md bg-elevated text-muted hover:text-fg"
          onClick={() => setHistOpen(true)}
          aria-label="Ventas de la semana"
        >
          <Clock className="size-5" />
        </button>
        </div>
        {products.length === 0 ? (
          <p className="mt-2 hidden text-xs text-subtle sm:block">
            Sin catálogo todavía. El precio se carga en Inventario.
          </p>
        ) : null}

        <div ref={catsRef} className="mt-3 flex cursor-grab gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <Chip active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>
            Todo
          </Chip>
          {categories.map((c) => (
            <Chip
              key={c.id}
              active={categoryFilter === c.id}
              onClick={() => setCategoryFilter(c.id)}
            >
              {c.name}
            </Chip>
          ))}
        </div>

        <div ref={listRef} className="mt-3 min-h-0 flex-1 overflow-y-auto no-scrollbar">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-subtle">
              {products.filter((p) => p.active).length === 0
                ? "Todavía no hay productos. Cargalos en Inventario."
                : "Nada con esa búsqueda."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {filtered.map((p) => (
                <li key={p.id}>
                  <ProductRow
                    product={p}
                    active={selectedId === p.id}
                    onAdd={() => tryAdd(p.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <TicketPanel
        className="hidden min-h-0 overflow-hidden lg:flex"
        ticket={ticket}
        total={total}
        cobro={cobro}
        onQty={setLineQty}
        onRemove={removeLine}
        onClear={clearTicket}
      />

      <PayPanel
        className="hidden min-h-0 overflow-hidden lg:flex"
        total={total}
        payMethod={payMethod}
        setPayMethod={setPayMethod}
        paidInput={paidInput}
        setPaidInput={setPaidInput}
        change={change}
        disabled={!ticket.length || !cash.open || busy || turnoAjeno}
        onConfirm={confirm}
        onRefund={() => setRefundOpen(true)}
        noShift={!cash.open}
        cashFloat={cashFloat}
        onOpenShift={openCash}
        piso={cobra ? undefined : { enviando: sending, onEnviar: () => void sendToDesk() }}
        turnoAjeno={turnoAjeno}
      />

      <div className="lg:hidden flex gap-2">
        <button
          type="button"
          onClick={() => setPayOpen(true)}
          className="flex min-w-0 flex-1 items-center justify-between rounded-xl bg-paper px-4 py-3.5 text-ink shadow-[var(--shadow-ticket)]"
        >
          <div className="text-left">
            <div className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">
              {ticket.length ? `${ticket.length} en el ticket` : "Ticket"}
            </div>
            <div className="num text-2xl font-medium leading-none">{formatARS(total)}</div>
          </div>
          <span className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-paper">
            {phone ? "Ver" : "Cobrar"}
          </span>
        </button>
        {phone ? (
          <Button
            size="lg"
            variant="paper"
            className="shrink-0 px-4"
            disabled={!ticket.length || sending}
            onClick={() => void sendToDesk()}
          >
            {sending ? "Enviando…" : "Enviar a la PC"}
          </Button>
        ) : null}
      </div>

      <Sheet open={payOpen} onOpenChange={setPayOpen}>
        <SheetContent side="bottom" className="flex max-h-[90dvh] flex-col gap-3">
          <TicketPanel
            className="max-h-[36vh]"
            ticket={ticket}
            total={total}
            cobro={cobro}
            onQty={setLineQty}
            onRemove={removeLine}
            onClear={clearTicket}
            compact
          />
          {phone ? (
            <Button
              size="lg"
              variant="paper"
              className="w-full"
              disabled={!ticket.length || sending}
              onClick={() => void sendToDesk()}
            >
              {sending ? "Enviando…" : "Enviar ticket a la PC"}
            </Button>
          ) : null}
          <PayPanel
            total={total}
            payMethod={payMethod}
            setPayMethod={setPayMethod}
            paidInput={paidInput}
            setPaidInput={setPaidInput}
            change={change}
            disabled={!ticket.length || !cash.open || busy || turnoAjeno}
            onConfirm={confirm}
            onRefund={() => setRefundOpen(true)}
            noShift={!cash.open}
            cashFloat={cashFloat}
            onOpenShift={openCash}
            piso={cobra ? undefined : { enviando: sending, onEnviar: () => void sendToDesk() }}
            turnoAjeno={turnoAjeno}
          />
        </SheetContent>
      </Sheet>
      <ClienteRefundDialog open={refundOpen} onOpenChange={setRefundOpen} />
      <SalesHistory open={histOpen} onOpenChange={setHistOpen} />
      {camOpen ? (
        <CameraScan
          stayOpen={phone}
          onClose={() => setCamOpen(false)}
          onCode={(code) => scanCode(code)}
        />
      ) : null}
    </div>
    </div>
  );
}

function ProductRow({
  product,
  active,
  onAdd,
}: {
  product: Product;
  active: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-150",
        active ? "bg-elevated" : "hover:bg-elevated/70",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium tracking-tight">{product.name}</div>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-subtle">
          <span>{product.barcode}</span>
          <span className={stockTone(product)}>
            {product.stock <= 0 ? "sin stock" : stockBreakdown(product)}
          </span>
        </div>
      </div>
      <div className="num text-lg font-medium text-sage">{formatARS(product.price)}</div>
    </button>
  );
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 rounded-full px-3 text-xs font-medium transition-colors duration-150",
        active ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function TicketPanel({
  ticket,
  total,
  cobro,
  onQty,
  onRemove,
  onClear,
  className,
  compact,
}: {
  ticket: { productId: string; name: string; price: number; qty: number }[];
  total: number;
  cobro: Cobro;
  onQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-paper p-4 text-ink shadow-[var(--shadow-ticket)] ticket-grain",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg tracking-tight">Ticket</h2>
        {ticket.length ? (
          <button type="button" onClick={onClear} className="text-xs text-ink-muted hover:text-ink">
            Vaciar
          </button>
        ) : null}
      </div>
      <div className={cn("mt-3 min-h-0 flex-1 overflow-y-auto", compact ? "max-h-40" : "")}>
        {ticket.length === 0 ? (
          <div className="flex h-full min-h-28 flex-col items-center justify-center text-ink-muted">
            <p className="text-sm">Todavía no hay líneas.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {ticket.map((l) => (
              <li key={l.productId} className="border-b border-ink/10 pb-2">
                {/* El nombre arriba, a todo lo ancho: al lado de los botones se cortaba y no se sabía qué producto era. */}
                <div className="break-words text-sm font-medium leading-snug">{l.name}</div>
                <div className="mt-0.5 flex items-center gap-1">
                  <div className="num min-w-0 flex-1 text-xs text-ink-muted">{formatARS(l.price)} · u.</div>
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-sm hover:bg-ink/5"
                    onClick={() => onQty(l.productId, l.qty - 1)}
                    aria-label="Menos"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="num w-5 text-center text-sm font-medium">{l.qty}</span>
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-sm hover:bg-ink/5"
                    onClick={() => onQty(l.productId, l.qty + 1)}
                    aria-label="Más"
                  >
                    <Plus className="size-3.5" />
                  </button>
                  {(() => {
                    const { importe, promo, marca } = importeDeLinea(cobro, l.productId, l.price * l.qty);
                    return (
                      <div className="w-20 text-right">
                        <div className={cn("num text-sm font-medium", promo && "text-danger")}>{formatARS(importe)}</div>
                        {promo ? <div className="text-[10px] font-medium uppercase text-danger">{marca}</div> : null}
                      </div>
                    );
                  })()}
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-sm text-ink-muted hover:text-danger"
                    onClick={() => onRemove(l.productId)}
                    aria-label="Quitar"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <PromosAplicadas cobro={cobro} />
      <div className="mt-3 flex min-h-[100px] items-end justify-between border-t border-dashed border-ink/20 pt-3">
        <span className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">Total</span>
        <span className="num text-3xl font-medium leading-none tracking-tight">{formatARS(total)}</span>
      </div>
    </section>
  );
}

function PayPanel({
  total,
  payMethod,
  setPayMethod,
  paidInput,
  setPaidInput,
  change,
  disabled,
  onConfirm,
  onRefund,
  noShift,
  cashFloat,
  onOpenShift,
  className,
  piso,
  turnoAjeno = false,
}: {
  total: number;
  payMethod: PayMethod;
  setPayMethod: (m: PayMethod) => void;
  paidInput: string;
  setPaidInput: (v: string) => void;
  change: number;
  disabled: boolean;
  onConfirm: () => void;
  onRefund?: () => void;
  noShift: boolean;
  cashFloat: number;
  onOpenShift: () => void;
  className?: string;
  /**
   * Esta PC no es la caja del local: arma el ticket y lo manda a la caja con
   * el medio de pago. Lo que pagó y el vuelto se cuentan en la caja.
   */
  piso?: { enviando: boolean; onEnviar: () => void };
  /** El turno abierto es de otro aparato: se cierra en Caja antes de cobrar. */
  turnoAjeno?: boolean;
}) {
  const methods: { id: PayMethod; label: string; icon: typeof Banknote }[] = [
    { id: "efectivo", label: "Efectivo", icon: Banknote },
    { id: "mercadopago", label: "Mercado Pago", icon: Smartphone },
    { id: "debito", label: "Débito", icon: CreditCard },
  ];

  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]",
        className,
      )}
    >
      <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Cuenta</h2>
      <p className="num mt-1 text-4xl font-medium leading-none tracking-tight text-sage">
        {formatARS(total)}
      </p>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
      <div className="grid grid-cols-3 gap-1.5">
        {methods.map((m) => {
          const Icon = m.icon;
          const on = payMethod === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setPayMethod(m.id)}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-md px-1 text-center text-[11px] font-medium transition-colors duration-150",
                on ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
              )}
            >
              <Icon className="size-4" />
              {m.label}
            </button>
          );
        })}
      </div>

      {piso ? (
        <p className="mt-4 rounded-md bg-bg px-3 py-3 text-sm text-muted">
          Esta PC no es la caja del local. El ticket va a la caja con el medio de pago; ahí se cobra.
        </p>
      ) : payMethod === "efectivo" ? (
        <div className="mt-4">
          <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Recibir</label>
          <Input
            inputMode="numeric"
            value={paidInput}
            onChange={(e) => setPaidInput(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="mt-1.5 h-12 text-xl font-medium"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="h-9 rounded-sm bg-elevated px-2.5 text-xs text-muted hover:text-fg"
              onClick={() => setPaidInput(String(total))}
            >
              Exacto
            </button>
            {CASH_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className="h-9 rounded-sm bg-elevated px-2.5 text-xs text-muted hover:text-fg"
                onClick={() => setPaidInput(String(k))}
              >
                {formatARS(k)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-baseline justify-between rounded-md bg-bg px-3 py-2.5">
            <span className="text-[11px] uppercase tracking-[0.08em] text-subtle">Vuelto</span>
            <span className="num text-2xl font-medium text-fg">{formatARS(change)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-md bg-bg px-3 py-3 text-center text-sm text-muted">
          Sin vuelto · se registra el total
        </p>
      )}

      {turnoAjeno && !piso ? (
        <p className="mt-4 rounded-md bg-warn/10 px-3 py-3 text-sm text-warn">
          Hay un turno abierto de otro aparato. Cerralo en Caja contando la plata antes de cobrar.
        </p>
      ) : null}

      {noShift && !piso ? (
        <div className="mt-4 rounded-md bg-warn/10 px-3 py-3">
          <p className="text-sm text-warn">La caja está cerrada. Abrila para vender.</p>
          <Button className="mt-2 w-full" variant="secondary" onClick={onOpenShift}>
            Abrir caja con {formatARS(cashFloat)}
          </Button>
          <p className="mt-1.5 text-center text-[11px] text-subtle">
            Otro fondo inicial, en la pestaña Caja
          </p>
        </div>
      ) : null}

      {piso ? null : <ShiftRail />}
      </div>

      <div className="mt-3 min-h-[100px] shrink-0">
        {piso ? (
          <Button className="w-full" size="lg" disabled={total <= 0 || piso.enviando} onClick={piso.onEnviar}>
            {piso.enviando ? "Enviando…" : "Enviar a la caja"}
          </Button>
        ) : (
          <Button className="w-full" size="lg" disabled={disabled} onClick={onConfirm}>
            Confirmar venta
          </Button>
        )}
        {onRefund && !piso && !turnoAjeno ? (
          <Button className="mt-2 w-full" variant="secondary" onClick={onRefund}>
            Devolver
          </Button>
        ) : null}
        {piso ? null : <p className="mt-2 hidden text-center text-[11px] text-subtle lg:block">Atajo F4</p>}
      </div>
    </section>
  );
}

function ShiftRail() {
  const cash = useCashSnapshot();
  const settings = useImanStore((s) => s.settings);
  const promos = useImanStore((s) => s.promos);
  const hour = new Date().getHours();
  const shiftKey = currentShiftKey(settings.shifts, hour);
  const tasks = settings.taskRemindersEnabled ? (settings.tasks[shiftKey] ?? []).slice(0, 3) : [];
  // Las promos que cobra la caja hoy: para ofrecerle al cliente.
  const hoy = todayKey();
  const offers = promos.filter((p) => vigente(p, hoy)).slice(0, 3);
  const rows = [
    { k: "Efectivo", v: cash.efectivo },
    { k: "MP", v: cash.mp },
    { k: "Débito", v: cash.debito },
  ];
  const max = Math.max(cash.salesTotal, 1);
  if (!cash.open && !tasks.length && !offers.length) return null;
  return (
    <div className="mt-4 space-y-3">
      {cash.open ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Este turno</p>
          <p className="num mt-1 text-sm text-muted">
            {cash.salesCount} {cash.salesCount === 1 ? "venta" : "ventas"} · {formatARS(cash.salesTotal)}
          </p>
          <ul className="mt-2 space-y-1.5">
            {rows.map((r) => (
              <li key={r.k}>
                <div className="flex justify-between text-[11px] text-muted">
                  <span>{r.k}</span>
                  <span className="num">{formatARS(r.v)}</span>
                </div>
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-1 rounded-full bg-sage"
                    style={{ width: `${Math.min(100, Math.round((Math.max(0, r.v) / max) * 100))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {tasks.length ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Para este turno</p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted">
            {tasks.map((t) => (
              <li key={t} className="truncate">
                {t}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {offers.length ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Promos de hoy</p>
          <ul className="mt-1.5 space-y-1 text-xs text-sage">
            {offers.map((p) => (
              <li key={p.id} className="truncate">
                {PROMO_NOMBRE[p.kind]} · {p.name} · {formatARS(p.price)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Lo que tiene un ticket, para elegir antes de sumar o reemplazar. */
function TicketResumen({ titulo, lineas, total }: { titulo: string; lineas: TicketLine[]; total: number }) {
  return (
    <div className="rounded-lg bg-elevated p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">{titulo}</p>
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
        {lineas.map((l) => (
          <li key={l.productId} className="flex justify-between gap-2">
            <span className="min-w-0 truncate">{l.name}</span>
            <span className="num shrink-0 text-muted">× {l.qty}</span>
          </li>
        ))}
      </ul>
      <p className="num mt-2 border-t border-border pt-2 text-right font-medium">{formatARS(total)}</p>
    </div>
  );
}
