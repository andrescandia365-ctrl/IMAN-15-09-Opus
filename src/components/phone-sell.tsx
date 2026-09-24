import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Banknote, CreditCard, Info, Minus, Plus, ScanBarcode, Search, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ProductPhoneDialog } from "@/components/phone-floor";
import { ScanStrip, type AvisoEscaneo } from "@/components/scan-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendOrQueueDeskTicket } from "@/lib/desk-outbox";
import { useDragScroll } from "@/lib/drag-scroll";
import { formatARS } from "@/lib/format";
import { vibrar } from "@/lib/camara-lectora";
import { useRol, useTurnoAjeno } from "@/lib/caja-local";
import { useDeskInbox } from "@/lib/desk-listen";
import { mergeTicketLines } from "@/lib/ticket-merge";
import { crearLectorTeclado, FIN_SIN_ENTER_MS } from "@/lib/escaneo";
import { findByScan } from "@/lib/pack";
import { productoNuevo } from "@/lib/producto-nuevo";
import { beep } from "@/lib/voice";
import { ticketTotal, useCashSnapshot, useImanStore } from "@/lib/store";
import type { PayMethod, Product, TicketLine } from "@/lib/types";
import { cn } from "@/lib/utils";
import { errorText } from "@/lib/errors";

const PACK_TOAST = "Eso es el bulto. Sumá stock en Inventario o Pedidos.";
/** Billetes de un toque para "Cuánto pagó", en el celu que es la caja. */
const BILLETES = [1000, 10_000, 20_000];
const SWIPE = 36;

function matchesNameOrCode(p: Product, q: string) {
  if (!q) return true;
  const n = q.trim().toLowerCase();
  if (!n) return true;
  const code = n.replace(/\s/g, "");
  return (
    p.name.toLowerCase().includes(n) ||
    p.barcode.toLowerCase().includes(code) ||
    Boolean(p.packBarcode && p.packBarcode.toLowerCase().includes(code)) ||
    (p.shortCode != null && String(p.shortCode).trim().toLowerCase() === code)
  );
}

function isTicketChrome(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button"));
}

export function PhoneSellView() {
  const products = useImanStore((s) => s.products);
  const categories = useImanStore((s) => s.categories);
  const ticket = useImanStore((s) => s.ticket);
  const addToTicket = useImanStore((s) => s.addToTicket);
  const setLineQty = useImanStore((s) => s.setLineQty);
  const removeLine = useImanStore((s) => s.removeLine);
  const clearTicket = useImanStore((s) => s.clearTicket);
  const payMethod = useImanStore((s) => s.payMethod);
  const setPayMethod = useImanStore((s) => s.setPayMethod);
  const deskStoreId = useImanStore((s) => s.deskStoreId);
  const saveProduct = useImanStore((s) => s.saveProduct);
  const paidInput = useImanStore((s) => s.paidInput);
  const setPaidInput = useImanStore((s) => s.setPaidInput);
  const checkout = useImanStore((s) => s.checkout);
  const openShift = useImanStore((s) => s.openShift);
  const cashFloat = useImanStore((s) => s.settings.cashFloat);
  const replaceTicket = useImanStore((s) => s.replaceTicket);
  const cash = useCashSnapshot();

  // El rol decide si este celu cobra (ver rol.ts). Si deja de ser la caja con
  // un ticket a medias, ese ticket se termina de cobrar: nunca en medio de una
  // venta. "Confirmar venta", "Cuánto pagó" y el vuelto son solo de la caja:
  // en un celu de piso invitaban a manejar plata donde no hay cajón.
  const { rol, puedeCobrar } = useRol(deskStoreId);
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
  const turnoAjeno = useTurnoAjeno(deskStoreId) && rol === "caja";
  const inbox = useDeskInbox(deskStoreId, puedeCobrar && Boolean(deskStoreId));

  const [cam, setCam] = useState(false);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoEscaneo | null>(null);
  const [alta, setAlta] = useState<Product | null>(null);
  const [altaTab, setAltaTab] = useState<"rapida" | "detalles">("rapida");
  const avisoTimer = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | "all">("all");
  const [asked, setAsked] = useState<Product | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const catsRef = useDragScroll<HTMLDivElement>();
  const listRef = useDragScroll<HTMLDivElement>();
  const swipe = useRef<{ y: number; moved: boolean } | null>(null);
  const ignoreClick = useRef(false);
  const total = ticketTotal(ticket);
  const paid = Number(paidInput) || 0;
  const change = payMethod === "efectivo" ? Math.max(0, paid - total) : 0;

  const filtered = useMemo(() => {
    return products
      .filter((p) => p.active)
      .filter((p) => cat === "all" || p.categoryId === cat)
      .filter((p) => matchesNameOrCode(p, q))
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .slice(0, 80);
  }, [products, cat, q]);

  function addProduct(p: Product) {
    const r = addToTicket(p.id, 1);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    setAsked(null);
    return true;
  }

  function applyExact(raw: string): boolean {
    const scanned = findByScan(products, raw);
    if (!scanned) return false;
    if (scanned.kind === "pack") {
      toast.error(PACK_TOAST);
      return true;
    }
    addProduct(scanned.product);
    return true;
  }

  // Buscar no suma: un código corto igual al principio de un código de barras
  // sumaba el producto equivocado a mitad del escaneo. Suma el Enter, o el
  // lector cuando termina de escribir (ver el efecto del lector en modo teclado).
  function onQueryChange(raw: string) {
    setQ(raw);
    setAsked(null);
  }

  function avisar(next: AvisoEscaneo) {
    setAviso(next);
    window.clearTimeout(avisoTimer.current);
    avisoTimer.current = window.setTimeout(() => setAviso(null), next.tipo === "falta" ? 6000 : 2500);
  }

  /** Un código que llegó de la cámara o del lector en modo teclado. */
  function leido(codigo: string, origen: "camara" | "teclado") {
    const hit = findByScan(useImanStore.getState().products, codigo);
    if (!hit) {
      beep(false);
      vibrar(false);
      if (origen === "camara") avisar({ tipo: "falta", texto: "No está cargado", codigo });
      else toast.error(`No está cargado: ${codigo}`, { action: { label: "Dar de alta", onClick: () => abrirAlta(codigo) } });
      return;
    }
    if (hit.kind === "pack") {
      vibrar(false);
      if (origen === "camara") avisar({ tipo: "falta", texto: PACK_TOAST });
      else toast.error(PACK_TOAST);
      return;
    }
    const antes = useImanStore.getState().ticket.find((l) => l.productId === hit.product.id)?.qty ?? 0;
    if (!addProduct(hit.product)) return;
    vibrar(true);
    setUltimo(hit.product.id);
    avisar({ tipo: "ok", texto: antes ? `${hit.product.name} · ahora ×${antes + 1}` : `Leído: ${hit.product.name}` });
  }

  /** Listo: con productos, lo que sigue es mandar el ticket; sin, vuelve a la lista. */
  function terminarEscaneo() {
    setCam(false);
    if (useImanStore.getState().ticket.length) setPayOpen(true);
  }

  function abrirAlta(codigo: string) {
    setAlta(productoNuevo(codigo));
    setAltaTab("rapida");
    setAviso(null);
  }

  function guardarAlta() {
    if (!alta || !alta.name.trim() || alta.price < 0) {
      toast.error("Nombre y precio son obligatorios");
      return;
    }
    const nuevo = { ...alta, name: alta.name.trim(), priceUpdatedAt: new Date().toISOString() };
    saveProduct(nuevo);
    setAlta(null);
    // Se escaneó para venderlo: entra al ticket.
    if (addProduct(nuevo)) {
      setUltimo(nuevo.id);
      avisar({ tipo: "ok", texto: `Leído: ${nuevo.name}` });
    }
  }

  const leidoRef = useRef(leido);
  leidoRef.current = leido;

  // Lector en modo teclado: escribe donde esté el foco, así que se escucha la
  // ventana entera. Solo se deja pasar lo que va a otro campo (el efectivo, un
  // diálogo): ahí el encargado está tipeando.
  useEffect(() => {
    const lector = crearLectorTeclado();
    let fin = 0;
    const ajeno = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      t !== searchRef.current &&
      (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
    // Si el lector escribió en el buscador, el código entero es lo que quedó
    // escrito: cada tecla redibuja la lista, las primeras llegan espaciadas y
    // el lector solo ve la cola rápida. La velocidad dice que fue un lector;
    // el buscador dice qué leyó.
    const entregar = (codigo: string) => {
      const buscador = searchRef.current;
      if (buscador && document.activeElement === buscador) {
        const escrito = buscador.value.trim();
        setQ("");
        leidoRef.current(escrito.endsWith(codigo) ? escrito : codigo, "teclado");
        return;
      }
      leidoRef.current(codigo, "teclado");
    };
    const onKey = (e: KeyboardEvent) => {
      if (ajeno(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.timeStamp;
      const codigo = lector.tecla(e.key, t);
      window.clearTimeout(fin);
      if (codigo) {
        e.preventDefault();
        e.stopPropagation();
        entregar(codigo);
        return;
      }
      fin = window.setTimeout(() => {
        const sinEnter = lector.fin(performance.now());
        if (sinEnter) entregar(sinEnter);
      }, FIN_SIN_ENTER_MS + 20);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(fin);
    };
  }, []);

  // La cámara se apaga al bloquear el celu o cambiar de app. Al cambiar de
  // pestaña se desmonta Vender y se apaga sola.
  useEffect(() => {
    if (!cam) return;
    const apagar = () => {
      if (document.visibilityState === "hidden") setCam(false);
    };
    const salir = () => setCam(false);
    document.addEventListener("visibilitychange", apagar);
    window.addEventListener("pagehide", salir);
    return () => {
      document.removeEventListener("visibilitychange", apagar);
      window.removeEventListener("pagehide", salir);
    };
  }, [cam]);

  useEffect(() => () => window.clearTimeout(avisoTimer.current), []);

  function onSearchSubmit() {
    const raw = q.trim();
    if (!raw) return;
    if (applyExact(raw)) {
      setQ("");
      return;
    }
    if (filtered.length === 1) {
      addProduct(filtered[0]!);
      setQ("");
    }
  }

  async function send() {
    if (!ticket.length) {
      toast.error("Armá el ticket primero");
      return;
    }
    if (!deskStoreId) {
      toast.error("Abrí un local");
      return;
    }
    setSending(true);
    try {
      const result = await sendOrQueueDeskTicket({
        storeId: deskStoreId,
        lines: ticket,
        payMethod,
        // Lo que pagó y el vuelto se cuentan en la PC, donde está el cajón.
        paid: null,
      });
      clearTicket();
      setPayOpen(false);
      if (result === "queued") {
        toast("Sin red. El sobre espera. La venta en este aparato sigue.");
      } else {
        toast.success(rol === "piso" ? "Ticket mandado a la caja" : "Ticket mandado a la PC");
      }
    } catch (err) {
      toast.error(errorText(err, "No se pudo enviar"));
    } finally {
      setSending(false);
    }
  }

  function onSwipeDown(e: ReactPointerEvent<HTMLElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (isTicketChrome(e.target)) return;
    ignoreClick.current = false;
    swipe.current = { y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onSwipeMove(e: ReactPointerEvent<HTMLElement>) {
    const start = swipe.current;
    if (!start) return;
    if (Math.abs(e.clientY - start.y) > 10) {
      start.moved = true;
      ignoreClick.current = true;
    }
  }

  function onSwipeUp(e: ReactPointerEvent<HTMLElement>) {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dy = e.clientY - start.y;
    if (dy < -SWIPE) setPayOpen(true);
    else if (dy > SWIPE) setPayOpen(false);
  }

  function onHandleClick() {
    if (ignoreClick.current) {
      ignoreClick.current = false;
      return;
    }
    setPayOpen((v) => !v);
  }

  function onHandlePointerDown(e: ReactPointerEvent<HTMLElement>) {
    e.stopPropagation();
    onSwipeDown(e);
  }

  // El botón principal del ticket. Hoy manda el ticket a la PC; cuando el celu
  // cobre (paso c del plan del celu) cambia acá y nada más.
  const accion = cobra
    ? {
        etiqueta: "Cobrar",
        deshabilitada: !ticket.length,
        hacer: () => {
          setCam(false);
          setPayOpen(true);
        },
      }
    : {
        etiqueta: sending ? "Enviando…" : rol === "piso" ? "Enviar a la caja" : "Enviar a la PC",
        deshabilitada: !ticket.length || sending,
        hacer: () => void send(),
      };

  /** La venta de verdad: checkout, con el turno abierto (ver store.ts). */
  function confirmar() {
    if (!cobra || turnoAjeno) return;
    const r = checkout();
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setPayOpen(false);
    setUltimo(null);
    toast.success("Venta registrada");
  }

  function abrirCaja() {
    if (!puedeCobrar) return;
    const r = openShift(cashFloat);
    if (!r.ok) toast.error(r.error);
    else toast.success("Caja abierta. Ya podés cobrar.");
  }

  /** Un ticket de otro aparato: si ya hay uno armado, se suman; si no, entra entero. */
  async function traerTicket() {
    const t = await inbox.accept();
    if (!t) return;
    const cur = useImanStore.getState();
    if (cur.ticket.length) replaceTicket(mergeTicketLines(cur.ticket, t.lines), { payMethod: cur.payMethod, paidInput: cur.paidInput });
    else replaceTicket(t.lines, { payMethod: t.payMethod, paidInput: t.paid != null ? String(t.paid) : "" });
    setPayOpen(true);
  }

  const methods: { id: PayMethod; label: string; icon: typeof Banknote }[] = [
    { id: "efectivo", label: "Efectivo", icon: Banknote },
    { id: "mercadopago", label: "MP", icon: Smartphone },
    { id: "debito", label: "Débito", icon: CreditCard },
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      {cam ? (
        <ScanStrip
          onLeido={(c) => leido(c, "camara")}
          pausada={Boolean(alta)}
          aviso={aviso}
          onAlta={abrirAlta}
        />
      ) : (
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
        <Input
          ref={searchRef}
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearchSubmit();
          }}
          placeholder="Nombre o código"
          className="h-16 rounded-xl bg-paper pl-12 pr-14 text-lg font-medium text-ink shadow-[var(--shadow-ticket)] ticket-grain placeholder:text-ink-muted"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Buscar por nombre o código"
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 grid size-12 -translate-y-1/2 place-items-center text-ink-muted"
          onClick={() => setCam(true)}
          aria-label="Cámara"
        >
          <ScanBarcode className="size-6" />
        </button>
      </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
        <div className={cn("flex min-h-32 flex-1 flex-col gap-1.5", payOpen && "invisible", cam && "hidden")}>
          <div ref={catsRef} className="flex shrink-0 cursor-grab gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <Chip active={cat === "all"} onClick={() => setCat("all")}>
              Todo
            </Chip>
            {categories.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div ref={listRef} className="h-full cursor-grab overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-subtle">
                  {products.filter((p) => p.active).length === 0
                    ? "Todavía no hay productos. Cargalos en Stock."
                    : "Nada con esa búsqueda."}
                </p>
              ) : (
                <ul>
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <ProductRow product={p} onAdd={() => addProduct(p)} onAsk={() => setAsked(p)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {asked ? (
              <>
                <button
                  type="button"
                  className="absolute inset-0 z-20 bg-bg/70"
                  aria-label="Cerrar consulta"
                  onClick={() => setAsked(null)}
                />
                <div className="absolute inset-x-2 top-2 z-30 rounded-xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
                  <p className="truncate font-display text-xl">{asked.name}</p>
                  <p className="num mt-1 text-3xl text-sage">{formatARS(asked.price)}</p>
                  <p className="mt-1 text-sm text-muted">{asked.stock} u. en góndola</p>
                  <p className="mt-0.5 font-mono text-[11px] text-subtle">{asked.barcode}</p>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "flex min-h-0 flex-col gap-1.5",
            payOpen ? "absolute inset-0 z-20" : "relative min-h-40 flex-1",
          )}
        >
      {cobra && inbox.incoming ? (
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-xl bg-sage/15 px-3 py-2.5">
          <p className="min-w-0 text-sm">
            <span className="font-medium">Ticket de otro aparato</span>
            <span className="block text-xs text-muted">{formatARS(inbox.incoming.total)}</span>
          </p>
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => inbox.dismiss()}>
              Después
            </Button>
            <Button size="sm" variant="paper" onClick={() => void traerTicket()}>
              Ponerlo acá
            </Button>
          </div>
        </div>
      ) : null}
      <section
        data-ticket-sheet
        data-pay-open={payOpen ? "1" : "0"}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-paper text-ink shadow-[var(--shadow-ticket)] ticket-grain"
        onPointerDown={onSwipeDown}
        onPointerMove={onSwipeMove}
        onPointerUp={onSwipeUp}
        onPointerCancel={() => {
          swipe.current = null;
        }}
      >
        <div className="flex shrink-0 flex-col px-4 pt-2 pb-2">
          <div
            className="flex touch-none select-none justify-center py-2"
            role="button"
            tabIndex={0}
            aria-label={payOpen ? "Achicar el ticket" : "Agrandar el ticket"}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onSwipeMove}
            onPointerUp={onSwipeUp}
            onPointerCancel={() => {
              swipe.current = null;
            }}
            onClick={onHandleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setPayOpen((v) => !v);
              }
            }}
          >
            <div className="h-1.5 w-12 rounded-full bg-ink/25" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg tracking-tight">Ticket</h2>
            {payOpen ? (
              <button
                type="button"
                className="h-9 rounded-md border border-ink/25 px-3 text-sm font-medium text-ink"
                onClick={() => setPayOpen(false)}
              >
                Volver a la lista
              </button>
            ) : cam ? null : (
              <div className="flex gap-1.5">
                {cobra ? null : (
                  <button
                    type="button"
                    className="h-9 rounded-md border border-ink/25 px-3 text-sm font-medium text-ink disabled:opacity-40"
                    disabled={!ticket.length}
                    onClick={() => setPayOpen(true)}
                  >
                    Ver ticket
                  </button>
                )}
                <button
                  type="button"
                  className="h-9 rounded-md bg-ink px-3 text-sm font-medium text-paper disabled:opacity-40"
                  disabled={accion.deshabilitada}
                  onClick={accion.hacer}
                >
                  {accion.etiqueta}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <TicketLines ticket={ticket} destacado={ultimo} onQty={setLineQty} onRemove={removeLine} />
        </div>
        <div className="flex shrink-0 items-end justify-between border-t border-dashed border-ink/20 px-4 py-3">
          <span className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">Total</span>
          <span className="num text-3xl font-medium leading-none">{formatARS(total)}</span>
        </div>
      </section>

      {cam && !payOpen ? (
        <div className="flex shrink-0 gap-1.5">
          <Button size="lg" variant="secondary" className="flex-1" onClick={terminarEscaneo}>
            Listo
          </Button>
          <Button size="lg" className="flex-1" disabled={accion.deshabilitada} onClick={accion.hacer}>
            {accion.etiqueta}
          </Button>
        </div>
      ) : null}

      {payOpen ? (
      <div className="shrink-0 space-y-1.5">
        {/* En un celu de piso, cómo paga viaja con el ticket y la caja lo recibe
            cargado; lo que pagó y el vuelto se cuentan en la caja. */}
        <p className="px-1 text-[11px] uppercase tracking-[0.08em] text-subtle">Cómo paga</p>
        <div className="grid grid-cols-3 gap-1.5">
          {methods.map((m) => {
            const Icon = m.icon;
            const on = payMethod === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => setPayMethod(m.id)}
                className={cn(
                  "flex h-12 flex-col items-center justify-center gap-0.5 rounded-md text-xs font-medium",
                  on ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
                )}
              >
                <Icon className="size-4" />
                {m.label}
              </button>
            );
          })}
        </div>
        {cobra && payMethod === "efectivo" ? (
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <label htmlFor="celu-pago" className="sr-only">
                Cuánto pagó
              </label>
              <Input
                id="celu-pago"
                inputMode="numeric"
                value={paidInput}
                onChange={(e) => setPaidInput(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="Cuánto pagó"
                className="h-11 min-w-0 flex-1 text-base font-medium"
              />
              {BILLETES.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="h-11 shrink-0 rounded-md bg-elevated px-2 text-[11px] text-muted"
                  onClick={() => setPaidInput(String(k))}
                >
                  {formatARS(k)}
                </button>
              ))}
            </div>
            <div className="flex items-baseline justify-between px-1">
              <span className="text-[11px] uppercase tracking-[0.08em] text-subtle">Vuelto</span>
              <span className="num text-lg font-medium text-sage">{formatARS(change)}</span>
            </div>
          </div>
        ) : null}
        {cobra && turnoAjeno ? (
          <p className="rounded-md bg-warn/10 px-3 py-2.5 text-sm text-warn">
            Hay un turno abierto de otro aparato. Cerralo en Caja contando la plata antes de cobrar.
          </p>
        ) : null}
        {cobra && !cash.open ? (
          <div className="rounded-md bg-warn/10 px-3 py-2.5">
            <p className="text-sm text-warn">La caja está cerrada. Abrila para cobrar.</p>
            <Button className="mt-2 w-full" variant="secondary" onClick={abrirCaja} disabled={!puedeCobrar}>
              Abrir caja con {formatARS(cashFloat)}
            </Button>
          </div>
        ) : null}
        {cobra ? (
          <Button className="w-full" size="lg" disabled={!ticket.length || !cash.open || turnoAjeno} onClick={confirmar}>
            Confirmar venta
          </Button>
        ) : (
          <Button className="w-full" size="lg" disabled={accion.deshabilitada} onClick={accion.hacer}>
            {accion.etiqueta}
          </Button>
        )}
      </div>
      ) : null}
        </div>
      </div>

      <ProductPhoneDialog
        open={Boolean(alta)}
        tab={altaTab}
        setTab={setAltaTab}
        product={alta}
        onChange={setAlta}
        onSave={guardarAlta}
        onClose={() => setAlta(null)}
      />
    </div>
  );
}

function TicketLines({
  ticket,
  destacado,
  onQty,
  onRemove,
}: {
  ticket: TicketLine[];
  /** El último leído: va arriba y resaltado. */
  destacado?: string | null;
  onQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  if (!ticket.length) {
    return <p className="py-4 text-center text-sm text-ink-muted">Un toque suma la unidad.</p>;
  }
  const arriba = destacado ? ticket.find((l) => l.productId === destacado) : undefined;
  const lineas = arriba ? [arriba, ...ticket.filter((l) => l !== arriba)] : ticket;
  return (
    <ul className="flex flex-col gap-2 pb-2">
      {lineas.map((l) => (
        <li
          key={l.productId}
          className={cn(
            "flex items-center gap-1 border-b border-ink/10 pb-2",
            l === arriba && "-mx-2 rounded-md border-transparent bg-sage/20 px-2 pt-2",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{l.name}</div>
            <div className="num text-xs text-ink-muted">{formatARS(l.price)}</div>
          </div>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-sm"
            onClick={() => onQty(l.productId, l.qty - 1)}
            aria-label="Menos"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="num w-5 text-center text-sm">{l.qty}</span>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-sm"
            onClick={() => onQty(l.productId, l.qty + 1)}
            aria-label="Más"
          >
            <Plus className="size-3.5" />
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center text-ink-muted"
            onClick={() => onRemove(l.productId)}
            aria-label="Quitar"
          >
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ProductRow({
  product,
  onAdd,
  onAsk,
}: {
  product: Product;
  onAdd: () => void;
  onAsk: () => void;
}) {
  const hold = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const skip = useRef(false);

  function clearHold() {
    if (hold.current) {
      window.clearTimeout(hold.current);
      hold.current = null;
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          skip.current = false;
          start.current = { x: e.clientX, y: e.clientY };
          clearHold();
          hold.current = window.setTimeout(() => {
            skip.current = true;
            onAsk();
            hold.current = null;
          }, 480);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) {
            skip.current = true;
            clearHold();
          }
        }}
        onPointerUp={() => {
          clearHold();
          start.current = null;
          if (!skip.current) onAdd();
        }}
        onPointerCancel={() => {
          clearHold();
          start.current = null;
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-elevated/70"
      >
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{product.name}</span>
        <span className="num shrink-0 text-sage">{formatARS(product.price)}</span>
      </button>
      <button
        type="button"
        className="grid size-11 shrink-0 place-items-center text-subtle"
        onClick={() => onAsk()}
        aria-label={`Ver ${product.name}`}
      >
        <Info className="size-4" />
      </button>
    </div>
  );
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-medium",
        active ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
      )}
    >
      {children}
    </button>
  );
}
