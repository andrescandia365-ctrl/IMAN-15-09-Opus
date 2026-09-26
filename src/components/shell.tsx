import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Ellipsis,
  LayoutGrid,
  Moon,
  ShoppingBag,
  Sun,
  Truck,
  UserRound,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { OwnerDesk } from "@/components/owner-desk";
import { OwnerPinDialog } from "@/components/owner-pin-dialog";
import { CashView } from "@/components/cash-view";
import { CounterView } from "@/components/counter-view";
import { InventoryView } from "@/components/inventory-view";
import { OrdersView } from "@/components/orders-view";
import { PhoneExpireView, PhoneStockView } from "@/components/phone-floor";
import { PhoneReceiveView } from "@/components/phone-receive";
import { PhoneSellView } from "@/components/phone-sell";
import { AvisoCartelesPorSacar } from "@/components/promo-ticket";
import { PhoneMasView } from "@/components/phone-mas";
import { ReceiptDialog } from "@/components/receipt";
import { DondeCobras } from "@/components/donde-cobras";
import { SyncButton } from "@/components/sync-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserButton } from "@/lib/auth/gates";
import { currentShiftKey, formatARS, shiftLabel } from "@/lib/format";
import { toast } from "sonner";
import { addStore, groupRollup, selectStore, verCaja, type StoreMeta, type StoreRollup } from "@/lib/kiosk";

import type { MyAccess } from "@/lib/license";
import { clearFlashSecret } from "@/lib/shop-secret-flash";
import { snapshotKiosk, useCashSnapshot, useImanStore } from "@/lib/store";
import { loadLocalSnapshot, saveLocalSnapshot, setActiveLocalStore } from "@/lib/local-db";
import { isBrowserOnline } from "@/lib/floor-lock";
import { syncNow } from "@/lib/sync";
import type { ViewId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRol, useVigilarCaja } from "@/lib/caja-local";
import { usePhoneUi } from "@/lib/device";
import { lockOwner } from "@/lib/owner-pin";
import { errorText } from "@/lib/errors";

/** Pregunta al servidor quién es la caja del local (ver useVigilarCaja). */
const consultarCaja = (storeId: string) => verCaja({ data: { storeId } });

const DESK_NAV: { id: ViewId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "counter", label: "Mostrador", icon: LayoutGrid },
  { id: "inventory", label: "Inventario", icon: ShoppingBag },
  { id: "orders", label: "Pedidos", icon: ClipboardList },
  { id: "cash", label: "Caja", icon: Wallet },
];

const PHONE_NAV: { id: ViewId | "owner"; label: string; icon: typeof LayoutGrid }[] = [
  { id: "counter", label: "Vender", icon: LayoutGrid },
  { id: "inventory", label: "Stock", icon: ShoppingBag },
  { id: "orders", label: "Llegó", icon: Truck },
  { id: "expire", label: "Vence", icon: AlertTriangle },
  { id: "owner", label: "Dueño", icon: UserRound },
];

/**
 * El celu que es la caja: cobrar y la caja a un toque; Llegó, Vence, Actualizar
 * precios e Importar van a Más, para no pasar de cinco pestañas.
 */
const PHONE_NAV_CAJA: { id: ViewId | "owner"; label: string; icon: typeof LayoutGrid }[] = [
  { id: "counter", label: "Vender", icon: LayoutGrid },
  { id: "cash", label: "Caja", icon: Wallet },
  { id: "inventory", label: "Stock", icon: ShoppingBag },
  { id: "mas", label: "Más", icon: Ellipsis },
  { id: "owner", label: "Dueño", icon: UserRound },
];

export function Shell({
  access,
  stores,
  activeStoreId,
  seats,
  onStores,
  onActiveStore,
  onLeave,
  onStudio,
}: {
  access: MyAccess;
  stores: StoreMeta[];
  activeStoreId: string;
  seats: number;
  onStores: (next: StoreMeta[]) => void;
  onActiveStore: (id: string) => void;
  onLeave: () => void;
  onStudio?: () => void;
}) {
  const view = useImanStore((s) => s.view);
  const setView = useImanStore((s) => s.setView);
  const settings = useImanStore((s) => s.settings);
  const saveSettings = useImanStore((s) => s.saveSettings);
  const products = useImanStore((s) => s.products);
  const hydrateKiosk = useImanStore((s) => s.hydrateKiosk);
  const cash = useCashSnapshot();
  const phone = usePhoneUi();
  useVigilarCaja(activeStoreId, consultarCaja);
  // El celu que es la caja cobra y lleva el turno (ver rol.ts).
  const { puedeCobrar } = useRol(activeStoreId);
  const cajaCelu = phone && puedeCobrar;
  const [clock, setClock] = useState(() => new Date());
  const [tasksOpen, setTasksOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [pinAsk, setPinAsk] = useState<"create" | "enter" | null>(null);
  const [lowDismissed, setLowDismissed] = useState<number | null>(null);
  const [wooSecret, setWooSecret] = useState("");
  const [switching, setSwitching] = useState(false);
  const [rollup, setRollup] = useState<{
    stores: StoreRollup[];
    todayTotal: number;
    monthTotal: number;
  } | null>(null);

  if (activeStoreId && useImanStore.getState().deskStoreId !== activeStoreId) {
    useImanStore.getState().setDeskStoreId(activeStoreId);
  }

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const owner = ownerOpen;
  const shiftKey = currentShiftKey(settings.shifts, clock.getHours());
  const tasks = settings.tasks[shiftKey] ?? [];
  const low = products.filter((p) => p.active && p.stock <= p.stockMin).length;
  const time = clock.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  function requestOwner() {
    if (ownerOpen) {
      lockOwner();
      setOwnerOpen(false);
      return;
    }
    setPinAsk(settings.ownerPinHash ? "enter" : "create");
  }

  useEffect(() => {
    if (!phone) return;
    const soloCaja = view === "cash" || view === "mas";
    if (view === "reports" || view === "settings" || (soloCaja && !cajaCelu)) {
      setView("counter");
    }
  }, [phone, cajaCelu, view, setView]);

  useEffect(() => {
    if (!ownerOpen) return;
    if (!isBrowserOnline()) return;
    void groupRollup()
      .then(setRollup)
      .catch((err) => console.error("[stores] rollup", err));
  }, [ownerOpen, stores, activeStoreId]);

  async function flushCurrent() {
    const snap = snapshotKiosk(useImanStore.getState());
    await saveLocalSnapshot(activeStoreId, snap);
    if (typeof navigator !== "undefined" && navigator.onLine) {
      await syncNow(activeStoreId).catch(() => {});
    }
  }

  async function switchTo(id: string) {
    if (id === activeStoreId || switching) {
      return;
    }
    setSwitching(true);
    try {
      await flushCurrent();
      const local = await loadLocalSnapshot(id);
      if (!isBrowserOnline()) {
        if (local) {
          onActiveStore(id);
          setActiveLocalStore(id);
          hydrateKiosk(local);
          setOwnerOpen(false);
          toast("Sin red. Abrimos la copia de este aparato.");
          return;
        }
        toast.error("Sin red. Este aparato no tiene una copia de ese local.");
        return;
      }
      const next = await selectStore({ data: { storeId: id } });
      onStores(next.stores);
      onActiveStore(next.activeStoreId);
      setActiveLocalStore(next.activeStoreId);
      hydrateKiosk(next.payload);
      setOwnerOpen(false);
      toast.success(next.payload.settings.name);
    } catch (err) {
      const local = await loadLocalSnapshot(id);
      if (local) {
        onActiveStore(id);
        setActiveLocalStore(id);
        hydrateKiosk(local);
        setOwnerOpen(false);
        toast("Sin red. Abrimos la copia de este aparato.");
        return;
      }
      toast.error(errorText(err, "No se pudo cambiar de local"));
    } finally {
      setSwitching(false);
    }
  }

  async function createLocal(name: string, catalog: "example" | "empty") {
    if (stores.length >= seats) {
      toast.error(`El plan abre ${seats} ${seats === 1 ? "local" : "locales"}`);
      return;
    }
    setSwitching(true);
    try {
      await flushCurrent();
      const next = await addStore({ data: { name, catalog } });
      onStores(next.stores);
      onActiveStore(next.activeStoreId);
      setActiveLocalStore(next.activeStoreId);
      hydrateKiosk(next.payload);
      setOwnerOpen(false);
      toast.success("Local nuevo");
    } catch (err) {
      toast.error(errorText(err, "No se pudo crear el local"));
    } finally {
      setSwitching(false);
    }
  }

  const pane = useMemo(() => {
    if (phone) {
      if (view === "inventory") return <PhoneStockView />;
      if (view === "orders") return <PhoneReceiveView />;
      if (view === "expire") return <PhoneExpireView />;
      if (view === "cash" && cajaCelu) return <CashView celu />;
      if (view === "mas" && cajaCelu) return <PhoneMasView />;
      return <PhoneSellView />;
    }
    switch (view) {
      case "inventory":
        return <InventoryView />;
      case "orders":
        return <OrdersView />;
      case "cash":
        return <CashView />;
      default:
        return <CounterView />;
    }
  }, [view, phone, cajaCelu]);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-bg text-fg">
        <header className="sticky top-0 z-40 grid h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-surface px-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(auto,1fr)] sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="flex min-w-0 items-center gap-3 text-left"
              onClick={() => requestOwner()}
              aria-label="Panel del dueño"
            >
              <BrandMark
                src={settings.storeLogo}
                className={cn("size-16", owner && "ring-2 ring-sage")}
                markClassName="size-8"
              />
              <span className="min-w-0">
                <span className="block truncate font-display text-xl leading-none tracking-tight">
                  {settings.name || "Local"}
                </span>
              </span>
            </button>
          </div>

          <nav
            className={cn(
              "hidden items-center gap-1 rounded-lg bg-bg p-1.5 sm:flex sm:-translate-x-10",
              owner && "sm:hidden",
            )}
          >
            {DESK_NAV.map((n) => {
              const Icon = n.icon;
              const on = view === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  aria-label={n.label}
                  onClick={() => setView(n.id)}
                  className={cn(
                    "inline-flex h-12 shrink-0 items-center gap-2 rounded-md px-3.5 text-base font-medium transition-colors duration-150 lg:px-4",
                    on ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
                  )}
                >
                  <Icon className="size-[1.125rem]" />
                  <span className="hidden md:inline">{n.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
            {onStudio ? (
              <button
                type="button"
                onClick={onStudio}
                className="hidden h-9 shrink-0 items-center rounded-md px-2.5 text-xs text-sage hover:bg-elevated sm:inline-flex"
              >
                Estudio
              </button>
            ) : null}
            <IconTip label="Tareas del turno">
              <button
                type="button"
                aria-label="Tareas del turno"
                onClick={() => setTasksOpen(true)}
                className="hidden h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs text-muted hover:bg-elevated hover:text-fg xl:inline-flex"
              >
                <span className="num">{time}</span>
                <span className="text-subtle">·</span>
                {shiftLabel(settings.shifts, shiftKey)}
              </button>
            </IconTip>
            <SyncButton storeId={activeStoreId} />
            {cash.over ? (
              <button
                type="button"
                className="hidden shrink-0 sm:inline-flex"
                onClick={() => setView("cash")}
              >
                <Badge variant="warn">Caja llena</Badge>
              </button>
            ) : (
              <IconTip label="Plata en caja · abrir Caja">
                <button
                  type="button"
                  aria-label="Plata en caja"
                  onClick={() => setView("cash")}
                  className="hidden h-9 shrink-0 items-center whitespace-nowrap rounded-md px-2 font-mono text-xs text-muted hover:text-fg lg:inline-flex"
                >
                  {formatARS(cash.cajaChica)}
                </button>
              </IconTip>
            )}
            <IconTip label={settings.voiceEnabled ? "Silenciar voz" : "Activar voz"}>
              <button
                type="button"
                aria-label={settings.voiceEnabled ? "Silenciar voz" : "Activar voz"}
                className="hidden size-10 shrink-0 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg sm:grid"
                onClick={() => saveSettings({ voiceEnabled: !settings.voiceEnabled })}
              >
                {settings.voiceEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
            </IconTip>
            <IconTip label={settings.theme === "dark" ? "Pantalla clara" : "Pantalla oscura"}>
              <button
                type="button"
                aria-label={settings.theme === "dark" ? "Pantalla clara" : "Pantalla oscura"}
                className="grid size-10 shrink-0 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg"
                onClick={() => saveSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
              >
                {settings.theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
            </IconTip>
            <div className="iman-account hidden shrink-0 md:block">
              <UserButton />
            </div>
          </div>
        </header>

        {access.isVendor && wooSecret ? (
          <div className="border-b border-border bg-paper px-4 py-3 text-ink">
            <p className="text-[11px] uppercase tracking-[0.14em] text-ink-muted">Path 2 · clave de WooCommerce</p>
            <p className="mt-1 break-all font-mono text-sm">{wooSecret}</p>
            <p className="mt-1 text-xs text-ink-muted">Copiala ahora. En el panel del dueño está el snippet.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(wooSecret);
                }}
              >
                Copiar clave
              </Button>
              <Button size="sm" variant="ghost" onClick={() => requestOwner()}>
                Ver el dueño
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearFlashSecret();
                  setWooSecret("");
                }}
              >
                Ya la guardé
              </Button>
            </div>
          </div>
        ) : null}

        {!access.isVendor && !access.license?.active && !access.trial?.active ? (
          <div className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn sm:mx-5">
            <span>Día 20. El mostrador sigue. Activá el plan cuando termines la fila.</span>
            <Button size="sm" variant="ghost" className="text-warn" onClick={onLeave}>
              Código
            </Button>
          </div>
        ) : null}

        {low > 0 && view === "counter" && !phone && lowDismissed !== low ? (
          <div className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn sm:mx-5">
            <span>{low} productos bajo mínimo</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="text-warn" onClick={() => setView("inventory")}>
                Ver
              </Button>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-md text-warn hover:bg-warn/10"
                aria-label="Quitar aviso"
                onClick={() => setLowDismissed(low)}
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        ) : null}

        <AvisoCartelesPorSacar />

        <main className="mx-auto min-h-0 w-full max-w-[2400px] flex-1 overflow-hidden px-3 py-3 pb-[calc(var(--bottom-nav)+16px)] sm:px-5 sm:pb-5">
          {ownerOpen ? (
            <OwnerDesk
              access={access}
              stores={stores}
              activeStoreId={activeStoreId}
              rollup={rollup}
              remaining={Math.max(0, seats - stores.length)}
              onClose={() => {
                lockOwner();
                setOwnerOpen(false);
              }}
              onHub={onLeave}
              onSwitch={(id) => void switchTo(id)}
              onCreate={(name) => void createLocal(name, "empty")}
            />
          ) : (
            <div className="h-full min-h-0 overflow-hidden">{pane}</div>
          )}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
          {(cajaCelu ? PHONE_NAV_CAJA : PHONE_NAV).map((n) => {
            const Icon = n.icon;
            // Llegó y Vence se abren desde Más cuando el celu es la caja.
            const enMas = cajaCelu && n.id === "mas" && (view === "orders" || view === "expire");
            const on = n.id === "owner" ? ownerOpen : !ownerOpen && (view === n.id || enMas);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (n.id === "owner") {
                    requestOwner();
                    return;
                  }
                  setOwnerOpen(false);
                  setView(n.id);
                }}
                className={cn(
                  "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px]",
                  on ? "text-sage" : "text-subtle",
                )}
              >
                <Icon className="size-4" />
                {n.label}
              </button>
            );
          })}
        </nav>

        <Sheet open={tasksOpen} onOpenChange={setTasksOpen}>
          <SheetContent side="right">
            <p className="font-display text-xl">
              Turno {shiftLabel(settings.shifts, shiftKey)}
            </p>
            <p className="mt-1 text-sm text-muted">{time}</p>
            {settings.taskRemindersEnabled ? (
              <ul className="mt-4 flex flex-col gap-2">
                {tasks.map((t) => (
                  <li key={t} className="rounded-md bg-elevated px-3 py-2.5 text-sm">
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-subtle">Recordatorios desactivados.</p>
            )}
          </SheetContent>
        </Sheet>

        <ReceiptDialog />
        <DondeCobras storeId={activeStoreId} />
        {pinAsk ? (
          <OwnerPinDialog
            open
            mode={pinAsk}
            onClose={() => setPinAsk(null)}
            onOk={() => {
              setPinAsk(null);
              setOwnerOpen(true);
            }}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function IconTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
