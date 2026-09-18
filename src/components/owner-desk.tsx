import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, FileText, MapPin, Settings2, Tag, Ticket, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { LedgerSheet } from "@/components/ledger-grid";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  booksForYm,
  cellValue,
  currentYm,
  downloadText,
  ledgerCsv,
  monthCc,
  monthDates,
  monthTitle,
  monthsOfQuarter,
  monthsOfYear,
  quarterOf,
} from "@/lib/ledger";
import { SettingsView } from "@/components/settings-view";
import { TeamView } from "@/components/team-view";
import { OwnerPrices } from "@/components/owner-prices";
import { OwnerTicket } from "@/components/owner-ticket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAY_LABEL, formatARS, todayKey } from "@/lib/format";
import type { StoreMeta, StoreRollup } from "@/lib/kiosk";
import type { MyAccess } from "@/lib/license";
import { unitCost } from "@/lib/pricing";
import type { MonthAgg, PayMethod, Product, Sale } from "@/lib/types";
import { useImanStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { usePhoneUi } from "@/lib/device";

type Tab = "precios" | "mes" | "ticket" | "factura" | "grupo" | "equipo" | "local";

export function OwnerDesk({
  access,
  onAccess,
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
  onAccess: (next: MyAccess) => void;
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
  const [gastosOpen, setGastosOpen] = useState(false);
  const books = useImanStore((s) => s.books);
  const sheets = useImanStore((s) => s.monthSheets);
  const labels = useImanStore((s) => s.settings.ledgerLabels);
  const releaseMonth = useImanStore((s) => s.releaseMonth);
  const nowYm = currentYm();
  const [year, setYear] = useState(() => Number(nowYm.slice(0, 4)));
  const [q, setQ] = useState<1 | 2 | 3 | 4>(() => quarterOf(nowYm));
  const [ym, setYm] = useState(nowYm);
  const qMonths = monthsOfQuarter(year, q);
  const viewBooks = useMemo(() => booksForYm(books, sheets, ym), [books, sheets, ym]);
  const cc = useMemo(() => monthCc(viewBooks, ym), [viewBooks, ym]);
  const current = ym === nowYm;
  const phone = usePhoneUi();
  const sales = useImanStore((s) => s.sales);
  const monthAggs = useImanStore((s) => s.monthAggs);
  const payouts = useImanStore((s) => s.payouts);
  const monthExpenses = useImanStore((s) => s.settings.monthExpenses);
  const mpFeePct = useImanStore((s) => s.settings.mpFeePct);
  const products = useImanStore((s) => s.products);
  const [salidaOpen, setSalidaOpen] = useState(false);
  const [resultadoOpen, setResultadoOpen] = useState(false);

  const anterior = prevYm(ym);
  const mes = useMemo(() => ventasDelMes(ym, sales, monthAggs), [ym, sales, monthAggs]);
  const mesPasado = useMemo(() => ventasDelMes(anterior, sales, monthAggs), [anterior, sales, monthAggs]);
  const ccPasado = useMemo(
    () => monthCc(booksForYm(books, sheets, anterior), anterior),
    [books, sheets, anterior],
  );
  // Un mes viejo puede haber perdido sus tickets y conservar la planilla.
  const ventasMes = mes?.ventas ?? (cc.totalVentas > 0 ? cc.totalVentas : null);
  const ventasPasado = mesPasado?.ventas ?? (ccPasado.totalVentas > 0 ? ccPasado.totalVentas : null);
  const dif = ventasMes != null && ventasPasado != null ? ventasMes - ventasPasado : null;
  const difPct = dif != null && ventasPasado ? (dif / ventasPasado) * 100 : null;

  const retiros = useMemo(
    () => monthDates(ym).reduce((a, d) => a + cellValue(viewBooks, d, "retiros"), 0),
    [viewBooks, ym],
  );
  const gastosFijos = (monthExpenses ?? []).reduce((a, r) => a + (r.amount || 0), 0);
  const sueldos = useMemo(
    () => payouts.filter((x) => ymLocal(x.createdAt) === ym).reduce((a, x) => a + x.amount, 0),
    [payouts, ym],
  );
  const salio = cc.proveedores + cc.gastos + gastosFijos + sueldos;
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto no-scrollbar">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium",
                tab === id ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          {phone ? null : (
            <Button variant="ghost" onClick={onHub}>
              Todos los locales
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {phone ? "Volver" : "Volver al mostrador"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "precios" ? (
          <div className="h-full min-h-0 overflow-hidden rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
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
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="grid size-11 place-items-center rounded-full bg-elevated text-sm text-muted hover:text-fg"
                onClick={() => setYear((y) => y - 1)}
              >
                ←
              </button>
              <span className="num px-1 text-sm">{year}</span>
              <button
                type="button"
                className="grid size-11 place-items-center rounded-full bg-elevated text-sm text-muted hover:text-fg"
                onClick={() => setYear((y) => y + 1)}
              >
                →
              </button>
              {([1, 2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setQ(n);
                    const months = monthsOfQuarter(year, n);
                    setYm(months.includes(nowYm) && nowYm.startsWith(String(year)) ? nowYm : months[0]!);
                  }}
                  className={cn(
                    "h-11 rounded-full px-3 text-sm font-medium",
                    q === n ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
                  )}
                >
                  Q{n}
                </button>
              ))}
              {qMonths.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setYm(m)}
                  className={cn(
                    "h-11 rounded-full px-3 text-sm font-medium capitalize",
                    ym === m ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
                  )}
                >
                  {monthTitle(m).split(" ")[0]}
                </button>
              ))}
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
                  Bajar CSV
                </span>
                {(
                  [
                    ["Mes", [ym]],
                    ["Año", monthsOfYear(year)],
                    ["Q1", monthsOfQuarter(year, 1)],
                    ["Q2", monthsOfQuarter(year, 2)],
                    ["Q3", monthsOfQuarter(year, 3)],
                    ["Q4", monthsOfQuarter(year, 4)],
                  ] as const
                ).map(([label, yms]) => (
                  <Button
                    key={label}
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const text = yms
                        .map((mo) => ledgerCsv(mo, booksForYm(books, sheets, mo), labels))
                        .join("\n\n");
                      downloadText(`iman-planilla-${label.toLowerCase()}-${year}.csv`, text);
                      toast.success("CSV descargado");
                    }}
                  >
                    {label}
                  </Button>
                ))}
                {!current ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const r = releaseMonth(ym);
                      if (!r.ok) toast.error(r.error);
                      else toast.success(`Liberadas ${r.freed} filas del mes. Queda el archivo del dueño.`);
                    }}
                  >
                    Liberar memoria
                  </Button>
                ) : null}
                <Button variant="secondary" size="sm" onClick={() => setGastosOpen(true)}>
                  Gastos fijos
                </Button>
                <Button size="sm" onClick={() => setResultadoOpen(true)}>
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
                      <Linea k="Gastos fijos" v={gastosFijos} />
                      <Linea k="Sueldos y adelantos" v={sueldos} />
                    </ul>
                  ) : null}
                </div>

                <Tarjeta titulo="Contra el mes pasado">
                  {dif == null ? (
                    <Vacio>Sin datos del mes pasado</Vacio>
                  ) : (
                    <>
                      <Grande className={dif >= 0 ? "text-sage" : "text-warn"}>
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

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                <Tarjeta titulo="Por medio de pago">
                  {mes == null ? (
                    <Vacio>De este mes no quedan tickets</Vacio>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {(["efectivo", "mercadopago", "debito"] as PayMethod[]).map((k) => (
                        <li key={k} className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="text-muted">{PAY_LABEL[k]}</span>
                          <span className="flex items-baseline gap-2">
                            <span className="num">{formatARS(mes[k])}</span>
                            <span className="num w-9 text-right text-xs text-subtle">
                              {mes.ventas > 0 ? Math.round((mes[k] / mes.ventas) * 100) : 0}%
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>

                <Tarjeta titulo="Egresos">
                  {!hayEgresos ? (
                    <Vacio>Sin movimientos cargados en la planilla</Vacio>
                  ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    <Linea k="Proveedores" v={cc.proveedores} grande />
                    <li className="flex flex-wrap gap-x-3 gap-y-0.5 pl-3 text-xs text-subtle">
                      <span>
                        Fac X <span className="num">{formatARS(cc.facX)}</span>
                      </span>
                      <span>
                        Fac A <span className="num">{formatARS(cc.facA)}</span>
                      </span>
                      <span>
                        Cigarrillos <span className="num">{formatARS(cc.cigarrillos)}</span>
                      </span>
                    </li>
                    <Linea k="Gastos de la planilla" v={cc.gastos} grande />
                    <Linea k="Gastos fijos" v={gastosFijos} grande />
                    <Linea k="Sueldos y adelantos" v={sueldos} grande />
                    <Linea k="Retiros del dueño" v={retiros} grande />
                  </ul>
                  )}
                </Tarjeta>

                <Tarjeta titulo="Tickets">
                  {mes == null || mes.tickets === 0 ? (
                    <Vacio>De este mes no quedan tickets</Vacio>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      <li className="flex items-baseline justify-between gap-2">
                        <span className="text-muted">Ventas</span>
                        <span className="num">{mes.tickets}</span>
                      </li>
                      <li className="flex items-baseline justify-between gap-2">
                        <span className="text-muted">Ticket promedio</span>
                        <span className="num">{formatARS(mes.ventas / mes.tickets)}</span>
                      </li>
                    </ul>
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
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
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
                  aggs={monthAggs}
                  products={products}
                  mpFeePct={mpFeePct ?? 0.06}
                  gastosPlanilla={cc.gastos}
                  gastosFijos={gastosFijos}
                  retiros={retiros}
                />
              </DialogContent>
            </Dialog>
            <Dialog open={gastosOpen} onOpenChange={setGastosOpen}>
              <DialogContent className="w-[min(36rem,calc(100vw-48px))] max-w-none p-6">
                <DialogHeader className="mb-4 pr-10">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">El mes</p>
                  <DialogTitle className="mt-1 font-display text-3xl leading-none tracking-tight">
                    Gastos fijos
                  </DialogTitle>
                  <DialogDescription>Alquiler y los que no cambian.</DialogDescription>
                </DialogHeader>
                <ExpenseEditor />
              </DialogContent>
            </Dialog>
          </div>
        ) : null}

        {tab === "equipo" ? (
          <div className="h-full min-h-0 overflow-hidden">
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
            <SettingsView access={access} onAccess={onAccess} />
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

function prevYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y ?? 2000, (m ?? 1) - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-subtle">{titulo}</p>
      {children}
    </div>
  );
}

function Grande({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("num mt-1 block font-display text-4xl leading-none tracking-tight", className)}>
      {children}
    </span>
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

function ExpenseEditor() {
  const settings = useImanStore((s) => s.settings);
  const saveSettings = useImanStore((s) => s.saveSettings);
  const rows = settings.monthExpenses ?? [];
  return (
    <ul className="space-y-2">
      {rows.map((e, i) => (
        <li key={e.name} className="flex gap-2">
          <Input className="flex-1" value={e.name} readOnly />
          <Input
            className="w-32 text-right"
            inputMode="numeric"
            value={e.amount || ""}
            onChange={(ev) => {
              const amount = Number(ev.target.value.replace(/[^\d]/g, "")) || 0;
              const next = rows.map((r, idx) => (idx === i ? { ...r, amount } : r));
              saveSettings({ monthExpenses: next });
            }}
          />
        </li>
      ))}
    </ul>
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
  aggs,
  products,
  mpFeePct,
  gastosPlanilla,
  gastosFijos,
  retiros,
}: {
  ym: string;
  sales: Sale[];
  aggs: MonthAgg[];
  products: Product[];
  mpFeePct: number;
  gastosPlanilla: number;
  gastosFijos: number;
  retiros: number;
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
    const agg = aggs.find((a) => a.ym === ym);
    if (agg) {
      ventas += agg.ventas;
      ventasMp += agg.mp;
      costo += agg.cogs;
      faltantes += agg.cogsMissing ?? 0;
    }
    const comision = ventasMp * mpFeePct;
    const gastos = gastosPlanilla + gastosFijos;
    const margen = ventas - costo - comision - gastos;
    return {
      ventas,
      ventasMp,
      costo,
      faltantes,
      comision,
      gastos,
      margen,
      quedo: margen - retiros,
      confiable: agg ? agg.cogsTrusted === true : true,
      fuente: vivas && agg ? "mixto" : agg ? "agregado" : "vivo",
      sinCosto: [...sinCosto],
      precioViejo: [...precioViejo],
    };
  }, [ym, sales, aggs, products, mpFeePct, gastosPlanilla, gastosFijos, retiros]);

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
        <Renglon k="Ventas del mes" v={r.ventas} fuente={fuenteVentas} />
        <Renglon
          k="Costo de lo vendido"
          v={-r.costo}
          fuente={
            r.faltantes
              ? `Costo guardado en cada venta · ${r.faltantes} ${plural(r.faltantes, "unidad", "unidades")} sin costo, que no suman`
              : "Costo guardado en cada venta; si falta, el del catálogo de hoy"
          }
        />
        <Renglon
          k="Comisión Mercado Pago"
          v={-r.comision}
          fuente={`${(mpFeePct * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}% sobre ${formatARS(r.ventasMp)} en Mercado Pago`}
        />
        <Renglon
          k="Gastos"
          v={-r.gastos}
          fuente="Filas de gasto de la planilla del mes más los gastos fijos"
        />
        <Subtotal k="Margen del negocio" v={r.margen} />
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
