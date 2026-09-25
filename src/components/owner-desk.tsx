import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  MapPin,
  Settings2,
  Tag,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type LabelProps,
} from "recharts";
import { desdeVentasVivas, ventasPorDia } from "@/lib/ventas-dia";
import { SALES_DAYS, SALES_KEEP } from "@/lib/cap";
import { toast } from "sonner";
import { LedgerSheet } from "@/components/ledger-grid";
import { LedgerRowsConfig } from "@/components/ledger-rows-config";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  booksForYm,
  currentYm,
  downloadText,
  ledgerCsv,
  ledgerRowsForYm,
  monthCc,
  monthTitle,
  monthsOfQuarter,
  monthsOfYear,
} from "@/lib/ledger";
import { CajaDelLocal } from "@/components/caja-del-local";
import { SettingsView } from "@/components/settings-view";
import { TeamView } from "@/components/team-view";
import { OwnerPrices } from "@/components/owner-prices";
import { OwnerTicket } from "@/components/owner-ticket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAY_LABEL, formatARS, formatARSCompact, todayKey } from "@/lib/format";
import type { StoreMeta, StoreRollup } from "@/lib/kiosk";
import type { MyAccess } from "@/lib/license";
import { unitCost } from "@/lib/pricing";
import { margenDelMes } from "@/lib/mes";
import type { MonthAgg, PayMethod, Product, Refund, Sale, Settings } from "@/lib/types";
import { useImanStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { usePhoneUi } from "@/lib/device";

type Tab = "precios" | "mes" | "ticket" | "factura" | "grupo" | "equipo" | "local";

export function OwnerDesk({
  access,
  stores,
  activeStoreId,
  rollup,
  remaining,
  onClose,
  onHub,
  onSwitch,
  onCreate,
}: {
  access: MyAccess;
  stores: StoreMeta[];
  activeStoreId: string;
  rollup: { stores: StoreRollup[]; todayTotal: number; monthTotal: number } | null;
  remaining: number;
  onClose: () => void;
  onHub: () => void;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("precios");
  const [newName, setNewName] = useState("");
  const [filasOpen, setFilasOpen] = useState(false);
  const books = useImanStore((s) => s.books);
  const sheets = useImanStore((s) => s.monthSheets);
  const releaseMonth = useImanStore((s) => s.releaseMonth);
  const nowYm = currentYm();
  const [ym, setYm] = useState(nowYm);
  const year = Number(ym.slice(0, 4));
  const settings = useImanStore((s) => s.settings);
  const viewRows = useMemo(
    () => ledgerRowsForYm(ym, settings, sheets),
    [ym, sheets, settings],
  );
  const viewBooks = useMemo(() => booksForYm(books, sheets, ym), [books, sheets, ym]);
  const cc = useMemo(() => monthCc(viewBooks, ym, viewRows), [viewBooks, ym, viewRows]);
  const current = ym === nowYm;
  const phone = usePhoneUi();
  const sales = useImanStore((s) => s.sales);
  const monthAggs = useImanStore((s) => s.monthAggs);
  const payouts = useImanStore((s) => s.payouts);
  const mpFeePct = settings.mpFeePct;
  const products = useImanStore((s) => s.products);
  const refunds = useImanStore((s) => s.refunds);
  const [salidaOpen, setSalidaOpen] = useState(false);
  const [resultadoOpen, setResultadoOpen] = useState(false);

  const anterior = prevYm(ym);
  const mes = useMemo(() => ventasDelMes(ym, sales, monthAggs), [ym, sales, monthAggs]);
  const mesPasado = useMemo(() => ventasDelMes(anterior, sales, monthAggs), [anterior, sales, monthAggs]);
  const rowsPasado = useMemo(
    () => ledgerRowsForYm(anterior, settings, sheets),
    [anterior, sheets, settings],
  );
  const ccPasado = useMemo(
    () => monthCc(booksForYm(books, sheets, anterior), anterior, rowsPasado),
    [books, sheets, anterior, rowsPasado],
  );
  // Un mes viejo puede haber perdido sus tickets y conservar la planilla.
  const ventasMes = mes?.ventas ?? (cc.totalVentas > 0 ? cc.totalVentas : null);
  const ventasPasado = mesPasado?.ventas ?? (ccPasado.totalVentas > 0 ? ccPasado.totalVentas : null);
  const dif = ventasMes != null && ventasPasado != null ? ventasMes - ventasPasado : null;
  const difPct = dif != null && ventasPasado ? (dif / ventasPasado) * 100 : null;

  const retiros = cc.retiros;
  const sueldos = useMemo(
    () => payouts.filter((x) => ymLocal(x.createdAt) === ym).reduce((a, x) => a + x.amount, 0),
    [payouts, ym],
  );
  const salio = cc.proveedores + cc.gastos + sueldos;
  // Un mes al que nunca se le cargó nada no tuvo cero de gastos: no tuvo datos.
  const hayEgresos = salio > 0 || retiros > 0;

  // La app y la planilla se cargan por separado: si no cierran, el dueño quiere saberlo.
  const descuadre =
    mes != null &&
    mes.ventas > 0 &&
    cc.totalVentas > 0 &&
    Math.abs(mes.ventas - cc.totalVentas) / Math.max(mes.ventas, cc.totalVentas) > 0.05;
  const tabs = (
    [
      ["precios", "Precios", Tag],
      ["mes", "El mes", Wallet],
      ["ticket", "Ticket", Ticket],
      ["factura", "Factura", FileText],
      ...(stores.length >= 2 ? ([["grupo", "Grupo", MapPin]] as const) : []),
      ["equipo", "Equipo", Users],
      ["local", "Local", Settings2],
    ] as const
  );

  const tabBtn = (id: (typeof tabs)[number][0], label: string, Icon: (typeof tabs)[number][2]) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium",
        phone ? "shrink-0" : "min-w-0 flex-1",
        tab === id ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {phone ? (
        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Dueño</p>
            <Button variant="secondary" onClick={onClose}>
              Volver
            </Button>
          </div>
          {/* Arriba de todo: quién es la caja y pasarla, sin entrar a Local. */}
          <CajaDelLocal storeId={activeStoreId} />
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {tabs.map(([id, label, Icon]) => tabBtn(id, label, Icon))}
          </div>
        </div>
      ) : (
        <>
        <CajaDelLocal storeId={activeStoreId} />
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto no-scrollbar">
            {tabs.map(([id, label, Icon]) => tabBtn(id, label, Icon))}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={onHub}>
              Todos los locales
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Volver al mostrador
            </Button>
          </div>
        </div>
        </>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "precios" ? (
          <div
            className={cn(
              "h-full min-h-0 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]",
              phone ? "overflow-y-auto" : "overflow-hidden",
            )}
          >
            <OwnerPrices />
          </div>
        ) : null}
        {tab === "ticket" ? (
          <div className="h-full min-h-0 overflow-y-auto rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
            <OwnerTicket />
          </div>
        ) : null}
        {tab === "grupo" ? (
          <div className="h-full min-h-0 space-y-4 overflow-y-auto">
            <div className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
              <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">Grupo</p>
              <p className="mt-1 font-display text-3xl">
                Hoy {formatARS(rollup?.todayTotal ?? 0)}
                <span className="ml-3 text-lg text-muted">mes {formatARS(rollup?.monthTotal ?? 0)}</span>
              </p>
              <ul className="mt-4 divide-y divide-border">
                {stores.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <button type="button" className="text-left" onClick={() => onSwitch(s.id)}>
                      <span className="font-medium">{s.alias || s.name}</span>
                      {s.alias && s.alias !== s.name ? (
                        <span className="ml-2 text-xs text-subtle">{s.name}</span>
                      ) : null}
                    </button>
                    <span className="num text-sm text-muted">
                      {formatARS(rollup?.stores.find((x) => x.id === s.id)?.todayTotal ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {remaining > 0 ? (
              <form
                className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = newName.trim();
                  if (!n) return;
                  onCreate(n);
                  setNewName("");
                }}
              >
                <p className="text-sm text-muted">Quedan {remaining} puertas en el plan.</p>
                <Input
                  className="mt-2"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre del local"
                />
                <Button type="submit" className="mt-3" disabled={!newName.trim()}>
                  Agregar local
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}

        {tab === "mes" ? (
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-x-hidden overflow-y-auto">
            <div className={cn("flex shrink-0 gap-2", phone ? "flex-col" : "flex-wrap items-center")}>
              <PeriodoPicker ym={ym} nowYm={nowYm} onYm={setYm} wide={phone} />
              <div className={cn("flex items-center gap-2", phone ? "w-full" : "ml-auto")}>
                <BajarCsv
                  className={phone ? "flex-1" : undefined}
                  ym={ym}
                  onBajar={(label, yms) => {
                    const text = yms
                      .map((mo) =>
                        ledgerCsv(mo, booksForYm(books, sheets, mo), ledgerRowsForYm(mo, settings, sheets)),
                      )
                      .join("\n\n");
                    downloadText(`iman-planilla-${label.toLowerCase()}-${year}.csv`, text);
                    toast.success("CSV descargado");
                  }}
                  onLiberar={
                    current
                      ? undefined
                      : () => {
                          const r = releaseMonth(ym);
                          if (!r.ok) toast.error(r.error);
                          else toast.success(`Liberadas ${r.freed} filas del mes. Queda el archivo del dueño.`);
                        }
                  }
                />
                <Button className={phone ? "flex-1" : undefined} onClick={() => setResultadoOpen(true)}>
                  Calcular el mes
                </Button>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Tarjeta titulo="Ventas del mes">
                  {ventasMes == null ? (
                    <Vacio>Sin ventas registradas este mes</Vacio>
                  ) : (
                    <>
                      <Grande>{formatARS(ventasMes)}</Grande>
                      {mes == null ? (
                        <p className="mt-1 text-xs text-muted">
                          Según la planilla. De ese mes ya no quedan tickets.
                        </p>
                      ) : null}
                    </>
                  )}
                </Tarjeta>

                <div className="rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
                  <button type="button" className="w-full text-left" onClick={() => setSalidaOpen((v) => !v)}>
                    <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-[0.12em] text-subtle">
                      Plata que salió
                      <ChevronDown className={cn("size-3.5 transition-transform", salidaOpen && "rotate-180")} />
                    </span>
                    {salio > 0 ? (
                      <Grande>{formatARS(salio)}</Grande>
                    ) : (
                      <Vacio>Sin pagos ni gastos cargados</Vacio>
                    )}
                  </button>
                  {salidaOpen ? (
                    <ul className="mt-2 space-y-0.5 border-t border-border pt-2 text-xs">
                      <Linea k="Proveedores" v={cc.proveedores} />
                      <Linea k="Gastos de la planilla" v={cc.gastos} />
                      <Linea k="Sueldos y adelantos" v={sueldos} />
                    </ul>
                  ) : null}
                </div>

                <Tarjeta titulo="Contra el mes pasado">
                  {dif == null ? (
                    <Vacio>Sin datos del mes pasado</Vacio>
                  ) : (
                    <>
                      <Grande className={dif > 0 ? "text-accent" : dif < 0 ? "text-warn" : undefined}>
                        {dif > 0 ? "+" : ""}
                        {formatARS(dif)}
                      </Grande>
                      <p className="mt-1 text-xs text-muted">
                        {difPct != null ? `${difPct > 0 ? "+" : ""}${Math.round(difPct)}% · ` : ""}
                        {monthTitle(anterior)} {formatARS(ventasPasado ?? 0)}
                      </p>
                    </>
                  )}
                </Tarjeta>
              </div>

              {descuadre && mes ? (
                <p className="px-1 text-xs text-subtle">
                  La app registró <span className="num">{formatARS(mes.ventas)}</span> y la planilla dice{" "}
                  <span className="num">{formatARS(cc.totalVentas)}</span>.
                </p>
              ) : null}

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <Tarjeta titulo="Ventas por día">
                    <VentasPorDia ym={ym} />
                  </Tarjeta>
                </div>
                <Tarjeta titulo="Ventas, últimos seis meses">
                  <VentasSeisMeses ym={ym} sales={sales} aggs={monthAggs} acostado={phone} />
                </Tarjeta>

                <Tarjeta titulo="Cómo te pagaron">
                  {mes == null || mes.ventas <= 0 ? (
                    <Vacio>De este mes no quedan tickets</Vacio>
                  ) : (
                    <ComoTePagaron mes={mes} />
                  )}
                </Tarjeta>
              </div>

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <Tarjeta
                  titulo="Egresos"
                  accion={
                    <button
                      type="button"
                      aria-label="Armar filas"
                      title="Armar filas"
                      onClick={() => setFilasOpen(true)}
                      className="-my-1.5 -mr-1.5 grid size-8 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg"
                    >
                      <Settings2 className="size-4" />
                    </button>
                  }
                >
                  {!hayEgresos ? (
                    <Vacio>Sin movimientos cargados en la planilla</Vacio>
                  ) : (
                  <ul className="mt-1.5 space-y-0.5 text-sm">
                    <Linea k="Proveedores" v={cc.proveedores} grande />
                    {cc.proveedorRows.some((r) => r.amount) ? (
                      <li className="flex flex-wrap gap-x-3 gap-y-0.5 pl-3 text-xs text-subtle">
                        {cc.proveedorRows
                          .filter((r) => r.amount)
                          .map((r) => (
                            <span key={r.id}>
                              {r.label} <span className="num">{formatARS(r.amount)}</span>
                            </span>
                          ))}
                      </li>
                    ) : null}
                    <Linea k="Gastos de la planilla" v={cc.gastos} grande />
                    <Linea k="Sueldos y adelantos" v={sueldos} grande />
                    <Linea k="Retiros del dueño" v={retiros} grande />
                  </ul>
                  )}
                </Tarjeta>

                <Tarjeta titulo="Tickets">
                  {mes == null || mes.tickets === 0 ? (
                    <Vacio>De este mes no quedan tickets</Vacio>
                  ) : (
                    <dl className="mt-1.5 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-muted">Ventas</dt>
                        <dd className="num font-mono text-lg">{mes.tickets}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Ticket promedio</dt>
                        <dd className="num font-mono text-lg">{formatARS(mes.ventas / mes.tickets)}</dd>
                      </div>
                    </dl>
                  )}
                </Tarjeta>
              </div>
            </div>
            {sheets
              .filter((s) => {
                const drop = new Date(s.archivedAt);
                drop.setMonth(drop.getMonth() + 12);
                const days = Math.ceil((drop.getTime() - Date.now()) / 86_400_000);
                return days > 0 && days <= 30;
              })
              .map((s) => (
                <p key={s.ym} className="shrink-0 text-sm text-warn">
                  {monthTitle(s.ym)} se borra en 30 días.
                </p>
              ))}
            {/* Alta como lo que se ve: al bajar hasta ella entra entera, con las fechas arriba. */}
            <div className="h-full min-h-[22rem] shrink-0 overflow-hidden rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
              <LedgerSheet ym={ym} editable={current} />
            </div>
            <Dialog open={resultadoOpen} onOpenChange={setResultadoOpen}>
              <DialogContent className="w-[min(34rem,calc(100vw-24px))]">
                <DialogHeader>
                  <DialogTitle>El resultado del mes</DialogTitle>
                  <DialogDescription>
                    {monthTitle(ym)} · se calcula acá y no se guarda en ningún lado.
                  </DialogDescription>
                </DialogHeader>
                <ResultadoDelMes
                  ym={ym}
                  sales={sales}
                  refunds={refunds}
                  aggs={monthAggs}
                  products={products}
                  mpFeePct={mpFeePct ?? 0.06}
                  gastosPlanilla={cc.gastos}
                  retiros={retiros}
                  settings={settings}
                />
              </DialogContent>
            </Dialog>
            <Dialog open={filasOpen} onOpenChange={setFilasOpen}>
              <DialogContent className="w-[min(36rem,calc(100vw-24px))] max-h-[min(90dvh,44rem)] max-w-none overflow-y-auto p-6">
                <DialogHeader className="mb-4 pr-10">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Asientos</p>
                  <DialogTitle className="mt-1 font-display text-3xl leading-none tracking-tight">
                    Filas de la planilla
                  </DialogTitle>
                  <DialogDescription>Ocultar no borra lo que ya se cargó.</DialogDescription>
                </DialogHeader>
                <LedgerRowsConfig />
              </DialogContent>
            </Dialog>
          </div>
        ) : null}

        {tab === "equipo" ? (
          <div className="h-full min-h-0 overflow-y-auto">
            <TeamView />
          </div>
        ) : null}

        {tab === "factura" ? (
          <div className="h-full min-h-0 overflow-y-auto rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
            <OwnerFactura />
          </div>
        ) : null}

        {tab === "local" ? (
          <div className="grid h-full min-h-0 gap-3 overflow-y-auto lg:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)]">
            <div className="flex flex-col gap-3">
            <div className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Locales</p>
              <ul className="mt-3 space-y-1">
                {stores.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onSwitch(s.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm",
                        s.id === activeStoreId ? "bg-accent text-accent-fg" : "hover:bg-elevated",
                      )}
                    >
                      <span>
                        <span className="block font-medium">{s.alias || s.name}</span>
                        {s.alias && s.alias !== s.name ? (
                          <span className="block text-xs text-subtle">{s.name}</span>
                        ) : null}
                      </span>
                      <span className="text-xs opacity-80">{s.id === activeStoreId ? "acá" : "Abrir"}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {remaining > 0 ? (
                <form
                  className="mt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = newName.trim();
                    if (!n) return;
                    onCreate(n);
                    setNewName("");
                  }}
                >
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nombre del local"
                  />
                  <Button type="submit" className="mt-2" disabled={!newName.trim()}>
                    Agregar local
                  </Button>
                </form>
              ) : null}
            </div>
            </div>
            <SettingsView access={access} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** El mes local de un sello ISO: la zona horaria no puede correr una venta de mes. */
function ymLocal(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : todayKey(d).slice(0, 7);
}

function moverMes(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y ?? 2000, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevYm(ym: string): string {
  return moverMes(ym, -1);
}

type MesVentas = {
  ventas: number;
  tickets: number;
  efectivo: number;
  mercadopago: number;
  debito: number;
};

/**
 * Lo vendido en un mes: los tickets que siguen vivos más lo que ya se plegó en
 * `monthAggs` al podar el bulto. Un ticket está en uno o en el otro, nunca en
 * los dos, así que se suman. `null` es "de ese mes no quedó nada", que no es lo
 * mismo que cero.
 */
function ventasDelMes(ym: string, sales: Sale[], aggs: MonthAgg[]): MesVentas | null {
  let vivos = 0;
  const t: MesVentas = { ventas: 0, tickets: 0, efectivo: 0, mercadopago: 0, debito: 0 };
  for (const s of sales) {
    if (ymLocal(s.createdAt) !== ym) continue;
    vivos += 1;
    t.ventas += s.total;
    t.tickets += 1;
    t[s.paymentMethod] += s.total;
  }
  const agg = aggs.find((a) => a.ym === ym);
  if (agg) {
    t.ventas += agg.ventas;
    t.tickets += agg.tickets;
    t.efectivo += agg.efectivo;
    t.mercadopago += agg.mp;
    t.debito += agg.debito;
  }
  return vivos || agg ? t : null;
}

function Tarjeta({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-subtle">{titulo}</p>
        {accion}
      </div>
      {children}
    </div>
  );
}

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** "Septiembre 2026", sin el "de" que pone el navegador. */
function nombreMes(ym: string): string {
  return `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}

/**
 * Las flechas mueven de a un mes, que es lo que se hace casi siempre. El resto
 * de la fecha (otro mes, otro año, un trimestre) vive en el popover del nombre.
 */
function PeriodoPicker({
  ym,
  nowYm,
  onYm,
  wide,
}: {
  ym: string;
  nowYm: string;
  onYm: (ym: string) => void;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const year = Number(ym.slice(0, 4));
  const [vista, setVista] = useState(year);
  const flecha = "grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-fg";
  const flechaAnio = "grid size-9 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg";

  function ir(next: string) {
    onYm(next);
    setOpen(false);
  }

  return (
    <div
      className={cn(
        "flex items-center rounded-full bg-elevated shadow-[var(--shadow-border)]",
        wide && "w-full",
      )}
    >
      <button type="button" aria-label="Mes anterior" className={flecha} onClick={() => onYm(moverMes(ym, -1))}>
        <ChevronLeft className="size-4" />
      </button>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) setVista(year);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-11 items-center justify-center gap-1.5 px-2 text-base font-medium",
              wide ? "min-w-0 flex-1" : "min-w-[11.5rem]",
            )}
          >
            {nombreMes(ym)}
            <ChevronDown className="size-3.5 text-muted" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[18rem] p-3">
          <div className="flex items-center justify-between">
            <button type="button" aria-label="Año anterior" className={flechaAnio} onClick={() => setVista((v) => v - 1)}>
              <ChevronLeft className="size-4" />
            </button>
            <span className="num text-sm font-medium">{vista}</span>
            <button type="button" aria-label="Año siguiente" className={flechaAnio} onClick={() => setVista((v) => v + 1)}>
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {MESES.map((nombre, i) => {
              const m = `${vista}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => ir(m)}
                  className={cn(
                    "h-10 rounded-md text-sm",
                    m === ym ? "bg-accent font-medium text-accent-fg" : "hover:bg-elevated",
                    m === nowYm && m !== ym && "font-medium text-accent",
                  )}
                >
                  {nombre.slice(0, 3)}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
            Ver el trimestre completo
          </p>
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {([1, 2, 3, 4] as const).map((n) => {
              const months = monthsOfQuarter(vista, n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => ir(months.includes(nowYm) ? nowYm : months[0]!)}
                  className={cn(
                    "h-10 rounded-md text-sm font-medium",
                    months.includes(ym) ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
                  )}
                >
                  Q{n}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <button type="button" aria-label="Mes siguiente" className={flecha} onClick={() => onYm(moverMes(ym, 1))}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/** Las seis descargas en un solo botón. Liberar memoria va acá porque se hace después de bajar el mes. */
function BajarCsv({
  ym,
  onBajar,
  onLiberar,
  className,
}: {
  ym: string;
  onBajar: (label: string, yms: string[]) => void;
  onLiberar?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const year = Number(ym.slice(0, 4));
  const corto = (m: string) => MESES[Number(m.slice(5, 7)) - 1]!.slice(0, 3).toLowerCase();
  const opciones: [string, string, string[]][] = [
    ["Mes", nombreMes(ym), [ym]],
    ["Año", String(year), monthsOfYear(year)],
    ...([1, 2, 3, 4] as const).map((n): [string, string, string[]] => {
      const months = monthsOfQuarter(year, n);
      return [`Q${n}`, `${corto(months[0]!)} a ${corto(months[2]!)} ${year}`, months];
    }),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" className={className}>
          <Download className="size-4" />
          Bajar CSV
          <ChevronDown className="size-4 text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        <ul>
          {opciones.map(([label, detalle, yms]) => (
            <li key={label}>
              <button
                type="button"
                className="flex h-10 w-full items-center justify-between gap-3 rounded-md px-3 text-sm hover:bg-elevated"
                onClick={() => {
                  onBajar(label, yms);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{label}</span>
                <span className="text-xs text-muted">{detalle}</span>
              </button>
            </li>
          ))}
        </ul>
        {onLiberar ? (
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm hover:bg-elevated"
              onClick={() => {
                onLiberar();
                setOpen(false);
              }}
            >
              <span className="font-medium">Liberar memoria</span>
              <span className="text-xs text-muted">Borra el detalle del mes. Queda el archivo del dueño.</span>
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** Los tres números de arriba se tienen que leer desde dos metros. */
function Grande({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "num mt-2 block font-mono text-[clamp(2.25rem,3.4vw,3.5rem)] font-medium leading-none tracking-tight",
        className,
      )}
    >
      {children}
    </span>
  );
}

const MEDIOS: { k: PayMethod; color: string }[] = [
  { k: "efectivo", color: "var(--color-accent)" },
  { k: "mercadopago", color: "var(--color-info)" },
  { k: "debito", color: "var(--color-warn)" },
];

/**
 * Una barra por mes, el que se está mirando en accent. Los meses cerrados
 * vienen de monthAggs y el que corre de los tickets vivos: ventasDelMes suma
 * los dos. Sin dos meses con datos no hay nada que comparar y no se dibuja.
 * En el celu va acostado para que los montos no se pisen.
 */
function VentasSeisMeses({
  ym,
  sales,
  aggs,
  acostado,
}: {
  ym: string;
  sales: Sale[];
  aggs: MonthAgg[];
  acostado: boolean;
}) {
  const datos = useMemo(
    () =>
      [-5, -4, -3, -2, -1, 0].map((d) => {
        const m = moverMes(ym, d);
        const v = ventasDelMes(m, sales, aggs)?.ventas ?? null;
        return { ym: m, mes: MESES[Number(m.slice(5, 7)) - 1]!.slice(0, 3), ventas: v ?? 0, sinDatos: v == null };
      }),
    [ym, sales, aggs],
  );
  if (datos.filter((d) => !d.sinDatos).length < 2) return <Vacio>Todavía no hay meses para comparar</Vacio>;

  const pintar = datos.map((d) => (
    <Cell
      key={d.ym}
      fill={d.ym === ym ? "var(--color-accent)" : "var(--color-muted)"}
      fillOpacity={d.ym === ym ? 1 : 0.45}
    />
  ));
  // Los montos van escritos: nada de tooltips. Un mes sin datos dice "sin datos", no $0.
  const monto = (p: LabelProps) => {
    const d = datos[Number(p.index)];
    if (!d) return null;
    const x = Number(p.x);
    const y = Number(p.y);
    const w = Number(p.width);
    const h = Number(p.height);
    const texto = d.sinDatos ? "sin datos" : formatARS(d.ventas);
    const clase = cn(
      "text-xs",
      d.sinDatos ? "fill-muted" : "font-mono",
      !d.sinDatos && (d.ym === ym ? "fill-fg font-medium" : "fill-muted"),
    );
    return acostado ? (
      <text x={x + w + 6} y={y + h / 2} dominantBaseline="central" className={clase}>
        {texto}
      </text>
    ) : (
      <text x={x + w / 2} y={y - 8} textAnchor="middle" className={clase}>
        {texto}
      </text>
    );
  };

  return acostado ? (
    <div className="mt-2 h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 108, bottom: 0, left: 0 }} barCategoryGap="22%">
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="mes"
            width={34}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
          />
          <Bar dataKey="ventas" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {pintar}
            <LabelList dataKey="ventas" content={monto} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  ) : (
    <div className="mt-2 h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 24, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
          <XAxis
            dataKey="mes"
            interval={0}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
          />
          <YAxis hide domain={[0, "dataMax"]} />
          <Bar dataKey="ventas" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {pintar}
            <LabelList dataKey="ventas" content={monto} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Una sola barra partida en efectivo, Mercado Pago y débito. El porcentaje va
 * arriba de cada parte y los montos abajo, con la misma muestra de color: el
 * color nunca es lo único que dice qué es cada parte.
 */
function ComoTePagaron({ mes }: { mes: MesVentas }) {
  const partes = MEDIOS.map((m) => ({ ...m, monto: mes[m.k], pct: (mes[m.k] / mes.ventas) * 100 }));
  const conPlata = partes.filter((p) => p.monto > 0);
  return (
    <div className="mt-3 overflow-x-hidden">
      <div className="flex flex-wrap gap-0.5">
        {conPlata.map((p) => (
          <span
            key={p.k}
            className="num min-w-[3.25rem] font-mono text-2xl font-medium leading-none"
            style={{ flex: `${p.monto} 1 0%` }}
          >
            {Math.round(p.pct)}%
          </span>
        ))}
      </div>
      <div
        className="mt-2 flex h-9 gap-0.5"
        role="img"
        aria-label={partes.map((p) => `${PAY_LABEL[p.k]} ${Math.round(p.pct)}%`).join(", ")}
      >
        {conPlata.map((p) => (
          <div key={p.k} className="rounded-[4px]" style={{ flex: `${p.monto} 0 0%`, background: p.color }} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {partes.map((p) => (
          <div key={p.k} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
              {PAY_LABEL[p.k]}
            </dt>
            <dd className="num mt-0.5 truncate font-mono text-base">{formatARS(p.monto)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <span className="mt-2 block text-sm text-muted">{children}</span>;
}

function Linea({ k, v, grande }: { k: string; v: number; grande?: boolean }) {
  return (
    <li className={cn("flex items-baseline justify-between gap-2", grande && "text-sm")}>
      <span className="text-muted">{k}</span>
      <span className="num">{formatARS(v)}</span>
    </li>
  );
}

function OwnerFactura() {
  const settings = useImanStore((s) => s.settings);
  const saveSettings = useImanStore((s) => s.saveSettings);
  const f = settings.fiscal ?? {
    enabled: false,
    cuit: "",
    puntoVenta: "1",
    tipo: "C" as const,
    api: "",
    queue: 0,
  };
  function patch(p: Partial<typeof f>) {
    saveSettings({ fiscal: { ...f, ...p } });
  }
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={f.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        Emitir factura
      </label>
      {f.enabled ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-subtle">CUIT</p>
            <Input value={f.cuit} onChange={(e) => patch({ cuit: e.target.value })} placeholder="20-12345678-9" />
          </div>
          <div>
            <p className="text-xs text-subtle">Punto de venta</p>
            <Input
              value={f.puntoVenta}
              onChange={(e) => patch({ puntoVenta: e.target.value })}
              placeholder="0001"
            />
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-subtle">Tipo</p>
            <div className="mt-1 flex gap-2">
              {(["C", "B", "A"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={cn(
                    "h-11 flex-1 rounded-full text-sm font-medium",
                    f.tipo === t ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
                  )}
                  onClick={() => patch({ tipo: t })}
                >
                  Fac {t}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-subtle">API / token del controlador</p>
            <Input value={f.api} onChange={(e) => patch({ api: e.target.value })} placeholder="Pegá la clave" />
          </div>
          <p className="text-sm text-muted sm:col-span-2">Cola: {f.queue} comprobantes pendientes.</p>
        </div>
      ) : null}
    </div>
  );
}

const HACE_60_DIAS = 60 * 86_400_000;

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

/**
 * La resta del mes. Se calcula cuando el dueño la pide y muere con el diálogo:
 * no se guarda, no se escribe en la planilla, no viaja a ningún lado.
 *
 * El costo de cada línea sale del costo que guardó la venta; las ventas viejas
 * que no lo traen caen al costo de hoy del producto, y si tampoco hay, la línea
 * se cuenta como faltante y avisa. De un mes ya plegado se usa lo que quedó en
 * el resumen, que puede venir del método viejo — por eso el aviso.
 */
function ResultadoDelMes({
  ym,
  sales,
  refunds,
  aggs,
  products,
  mpFeePct,
  gastosPlanilla,
  retiros,
  settings,
}: {
  ym: string;
  sales: Sale[];
  refunds: Refund[];
  aggs: MonthAgg[];
  products: Product[];
  mpFeePct: number;
  gastosPlanilla: number;
  retiros: number;
  settings: Settings;
}) {
  const r = useMemo(() => {
    const byId = new Map(products.map((x) => [x.id, x]));
    const viejo = Date.now() - HACE_60_DIAS;
    const sinCosto = new Set<string>();
    const precioViejo = new Set<string>();
    let ventas = 0;
    let ventasMp = 0;
    let costo = 0;
    let faltantes = 0;
    let vivas = 0;
    for (const s of sales) {
      if (ymLocal(s.createdAt) !== ym) continue;
      vivas += 1;
      ventas += s.total;
      if (s.paymentMethod === "mercadopago") ventasMp += s.total;
      for (const it of s.items) {
        const p = byId.get(it.productId);
        const c = typeof it.cost === "number" && it.cost > 0 ? it.cost : p ? unitCost(p) : null;
        if (c == null) {
          faltantes += it.qty;
          sinCosto.add(it.name);
        } else {
          costo += c * it.qty;
        }
        if (p && new Date(p.priceUpdatedAt).getTime() < viejo) precioViejo.add(p.name);
      }
    }
    // Lo que volvió a la góndola: se resta de las ventas una sola vez, y su
    // costo se devuelve porque la mercadería está de nuevo adentro.
    let devuelto = 0;
    let devueltoCosto = 0;
    const ventasById = new Map(sales.map((x) => [x.id, x]));
    for (const r of refunds) {
      if (r.kind !== "cliente" || ymLocal(r.createdAt) !== ym) continue;
      devuelto += r.amount;
      const linea = r.saleId
        ? ventasById.get(r.saleId)?.items.find((it) => it.productId === r.productId)
        : undefined;
      const prod = byId.get(r.productId);
      const c =
        typeof linea?.cost === "number" && linea.cost > 0 ? linea.cost : prod ? unitCost(prod) : null;
      if (c == null) faltantes += r.units;
      else devueltoCosto += c * r.units;
    }
    const agg = aggs.find((a) => a.ym === ym);
    if (agg) {
      ventas += agg.ventas;
      ventasMp += agg.mp;
      costo += agg.cogs;
      faltantes += agg.cogsMissing ?? 0;
      devuelto += agg.devoluciones ?? 0;
      devueltoCosto += agg.devolucionesCogs ?? 0;
    }
    const comision = ventasMp * mpFeePct;
    const gastos = gastosPlanilla;
    const cuenta = margenDelMes({
      ventas,
      devuelto,
      costo,
      devueltoCosto,
      comision,
      gastos,
      retiros,
      settings,
    });
    return {
      ventas,
      ventasMp,
      costo,
      devuelto,
      devueltoCosto,
      // Un mes plegado antes de que existiera esto no guardó sus devoluciones.
      aggSinDevoluciones: Boolean(agg) && agg?.devoluciones === undefined,
      faltantes,
      comision,
      gastos,
      margen: cuenta.margen,
      quedo: cuenta.quedo,
      stripsTax: cuenta.stripsTax,
      ventasNetas: cuenta.ventasNetas,
      etiquetaVentas: cuenta.etiquetaVentas,
      etiquetaMargen: cuenta.etiquetaMargen,
      etiquetaSinImpuesto: cuenta.etiquetaSinImpuesto,
      confiable: agg ? agg.cogsTrusted === true : true,
      fuente: vivas && agg ? "mixto" : agg ? "agregado" : "vivo",
      sinCosto: [...sinCosto],
      precioViejo: [...precioViejo],
    };
  }, [ym, sales, refunds, aggs, products, mpFeePct, gastosPlanilla, retiros, settings]);

  const fuenteVentas =
    r.fuente === "vivo"
      ? "Suma de los tickets de este mes"
      : r.fuente === "agregado"
        ? "Del resumen guardado del mes: ya no quedan los tickets"
        : "Tickets de este mes más el resumen de lo que ya se plegó";

  return (
    <div className="mt-1">
      {!r.confiable ? (
        <Aviso>El costo de este mes se calculó con un método viejo. El margen no es confiable.</Aviso>
      ) : null}
      {r.sinCosto.length ? (
        <Aviso nombres={r.sinCosto}>
          {r.sinCosto.length} {plural(r.sinCosto.length, "producto vendido no tiene", "productos vendidos no tienen")}{" "}
          costo cargado. El margen sale más alto de lo real.
        </Aviso>
      ) : null}
      {r.precioViejo.length ? (
        <Aviso nombres={r.precioViejo}>
          {r.precioViejo.length} {plural(r.precioViejo.length, "producto tiene", "productos tienen")} el precio sin
          tocar hace más de 60 días.
        </Aviso>
      ) : null}

      <ul className="mt-3 flex flex-col">
        <Renglon k={r.etiquetaVentas} v={r.ventas} fuente={fuenteVentas} />
        {r.devuelto || r.devueltoCosto || r.aggSinDevoluciones ? (
          <>
            <Renglon
              k="Devoluciones a clientes"
              v={-r.devuelto}
              fuente={
                r.aggSinDevoluciones
                  ? "De este mes no quedaron devoluciones registradas"
                  : "Lo que se le devolvió al cliente, una sola vez"
              }
            />
          </>
        ) : null}
        {r.stripsTax ? (
          <Renglon
            k={r.etiquetaSinImpuesto}
            v={-(r.ventas - r.devuelto - r.ventasNetas)}
            fuente="El precio de góndola trae el impuesto; eso no es ganancia"
          />
        ) : null}
        <Renglon
          k="Costo de lo vendido"
          v={-r.costo}
          fuente={
            r.faltantes
              ? `Costo guardado en cada venta · ${r.faltantes} ${plural(r.faltantes, "unidad", "unidades")} sin costo, que no suman`
              : "Costo guardado en cada venta; si falta, el del catálogo de hoy"
          }
        />
        {r.devuelto || r.devueltoCosto ? (
          <Renglon
            k="Costo de lo devuelto"
            v={r.devueltoCosto}
            fuente="La mercadería volvió a la góndola: su costo se devuelve"
          />
        ) : null}
        <Renglon
          k="Comisión Mercado Pago"
          v={-r.comision}
          fuente={`${(mpFeePct * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}% sobre ${formatARS(r.ventasMp)} cobrados por Mercado Pago · la cobran igual si el cliente devuelve`}
        />
        <Renglon
          k="Gastos"
          v={-r.gastos}
          fuente="Filas de gasto de la planilla"
        />
        <Subtotal k={r.etiquetaMargen} v={r.margen} />
        <Renglon k="Lo que se llevó el dueño" v={-retiros} fuente="Fila RETIROS de la planilla" />
        <Subtotal k="Quedó en el negocio" v={r.quedo} />
      </ul>
    </div>
  );
}

function Aviso({ children, nombres }: { children: ReactNode; nombres?: string[] }) {
  return (
    <p className="mt-2 rounded-lg bg-elevated px-3 py-2 text-xs leading-snug text-warn">
      {children}
      {nombres?.length ? <span className="mt-0.5 block text-subtle">{nombres.join(" · ")}</span> : null}
    </p>
  );
}

function Renglon({ k, v, fuente }: { k: string; v: number; fuente: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-border py-2">
      <span className="min-w-0">
        <span className="block text-sm">{k}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-subtle">{fuente}</span>
      </span>
      <span className="num shrink-0 text-sm">{formatARS(v)}</span>
    </li>
  );
}

function Subtotal({ k, v }: { k: string; v: number }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-border py-2.5">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-subtle">{k}</span>
      <span className={cn("num font-display text-2xl leading-none tracking-tight", v >= 0 ? "text-sage" : "text-warn")}>
        {formatARS(v)}
      </span>
    </li>
  );
}

/**
 * El total vendido de cada día del mes, en línea, contra otro mes (por
 * defecto el anterior). Los días recientes salen de las ventas; los viejos, de
 * los turnos cerrados (ver ventas-dia.ts). Un día sin dato es un hueco en la
 * línea, no un cero. El mes de comparación va punteado: no depende solo del
 * color.
 */
function VentasPorDia({ ym }: { ym: string }) {
  const sales = useImanStore((s) => s.sales);
  const shifts = useImanStore((s) => s.shifts);
  const [otro, setOtro] = useState(() => moverMes(ym, -1));
  useEffect(() => setOtro(moverMes(ym, -1)), [ym]);

  const datos = useMemo(() => {
    const opts = {
      hoy: todayKey(),
      desdeVivas: desdeVentasVivas(sales, { hoy: new Date(), dias: SALES_DAYS, tope: SALES_KEEP }),
    };
    const este = ventasPorDia(ym, sales, shifts, opts);
    const comparado = ventasPorDia(otro, sales, shifts, opts);
    return Array.from({ length: 31 }, (_, i) => ({
      dia: i + 1,
      este: este[i] ?? null,
      otro: comparado[i] ?? null,
    }));
  }, [ym, otro, sales, shifts]);

  const conDatoEste = datos.filter((d) => d.este != null);
  const opciones = [-1, -2, -3, -4, -5, -6, -12].map((n) => moverMes(ym, n));
  const nombre = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

  // Pico y valle del mes elegido, escritos; el resto, al pasar el dedo.
  const pico = conDatoEste.reduce<(typeof datos)[number] | null>((a, d) => (!a || (d.este ?? 0) > (a.este ?? 0) ? d : a), null);
  const valle = conDatoEste.reduce<(typeof datos)[number] | null>((a, d) => (!a || (d.este ?? 0) < (a.este ?? 0) ? d : a), null);
  const rotulo = (p: { x?: number; y?: number; index?: number }) => {
    const d = datos[Number(p.index)];
    if (!d || d.este == null || (d !== pico && d !== valle) || pico === valle) return <g />;
    return (
      <text
        x={Number(p.x)}
        y={Number(p.y) - 10}
        textAnchor="middle"
        className="fill-fg font-mono text-[11px]"
      >
        {formatARSCompact(d.este)}
      </text>
    );
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden="true">
            <line x1="0" y1="3" x2="18" y2="3" stroke="var(--color-accent)" strokeWidth="2" />
          </svg>
          {nombre(ym)}
        </span>
        <label className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden="true">
            <line x1="0" y1="3" x2="18" y2="3" stroke="var(--color-subtle)" strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          <span className="sr-only">Comparar con</span>
          <select
            value={otro}
            onChange={(e) => setOtro(e.target.value)}
            className="rounded-md bg-elevated px-2 py-1 text-xs text-fg"
            aria-label="Mes para comparar"
          >
            {opciones.map((m) => (
              <option key={m} value={m}>
                {nombre(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!datos.some((d) => (d.este ?? 0) > 0 || (d.otro ?? 0) > 0) ? (
        <Vacio>De estos meses no quedan ventas por día</Vacio>
      ) : (
        <div
          className="mt-2 h-56"
          role="img"
          aria-label={`Ventas por día de ${nombre(ym)} contra ${nombre(otro)}${
            pico?.este != null ? `. El día que más vendió, el ${pico.dia}: ${formatARS(pico.este)}` : ""
          }`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="0" />
              <XAxis
                dataKey="dia"
                ticks={[1, 5, 10, 15, 20, 25, 31]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
              />
              <YAxis
                width={72}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                tickFormatter={(v: number) => formatARSCompact(v)}
              />
              <Tooltip
                cursor={{ stroke: "var(--color-subtle)", strokeWidth: 1 }}
                content={({ active, label }) => {
                  if (!active) return null;
                  const d = datos[Number(label) - 1];
                  if (!d) return null;
                  return (
                    <div className="rounded-md bg-surface px-3 py-2 text-xs shadow-[var(--shadow-border)]">
                      <p className="font-medium text-fg">Día {d.dia}</p>
                      <p className="mt-0.5 text-muted">
                        {nombre(ym)}: <span className="num text-fg">{d.este == null ? "sin dato" : formatARS(d.este)}</span>
                      </p>
                      <p className="text-muted">
                        {nombre(otro)}: <span className="num text-fg">{d.otro == null ? "sin dato" : formatARS(d.otro)}</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="otro"
                stroke="var(--color-subtle)"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="este"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: "var(--color-surface)", strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls={false}
                label={rotulo}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-1 text-[11px] text-subtle">
        Los días recientes salen de las ventas; los más viejos, de los turnos cerrados. Un hueco es un día sin
        dato.
      </p>
    </div>
  );
}
