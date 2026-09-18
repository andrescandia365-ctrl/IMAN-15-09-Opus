import { useState } from "react";
import { Landmark, Lock, Unlock } from "lucide-react";
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
import { formatARS, formatTime } from "@/lib/format";
import { useCashSnapshot, useImanStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { EncargadoBook } from "@/components/ledger-grid";
import { PriceCalcCard } from "@/components/price-calc";
import { onShiftNow } from "@/lib/team";

export function CashView() {
  const cash = useCashSnapshot();
  const settings = useImanStore((s) => s.settings);
  const openShift = useImanStore((s) => s.openShift);
  const closeShift = useImanStore((s) => s.closeShift);
  const addDrop = useImanStore((s) => s.addDrop);
  const shifts = useImanStore((s) => s.shifts);
  const drops = useImanStore((s) => s.drops);
  const refunds = useImanStore((s) => s.refunds);
  const cover = onShiftNow(
    useImanStore((s) => s.staff),
    useImanStore((s) => s.roster),
    settings.shifts,
  );

  const [openAmt, setOpenAmt] = useState(String(settings.cashFloat));
  const [closeAmt, setCloseAmt] = useState("");
  const [celAmt, setCelAmt] = useState("");
  const [subeAmt, setSubeAmt] = useState("");
  const [safeAmt, setSafeAmt] = useState("");
  const [dropAmt, setDropAmt] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const ratio = cash.threshold > 0 ? Math.min(1, cash.cajaChica / cash.threshold) : 0;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="flex flex-col gap-5 pb-10">
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-xl bg-surface p-6 shadow-[var(--shadow-border)]">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
              Caja chica
            </h2>
            {cash.open ? (
              <Badge variant="sage">Abierta</Badge>
            ) : (
              <Badge variant="warn">Cerrada</Badge>
            )}
          </div>
          <p className="num mt-2 text-5xl font-medium leading-none tracking-tight text-sage">
            {formatARS(cash.cajaChica)}
          </p>
          <p className="mt-2 text-sm text-muted">
            Caja chica {formatARS(cash.threshold)}
            {cash.over ? " · llevá plata a la fuerte" : " · techo de la chica"}
            {cover ? ` · cubre ${cover.name}` : ""}
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-elevated">
            <div
              className={cn("h-full rounded-full", cash.over ? "bg-warn" : "bg-accent")}
              style={{ width: `${Math.max(4, ratio * 100)}%` }}
            />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <Stat k="Apertura" v={formatARS(cash.open?.openingCash ?? 0)} />
            <Stat k="Efectivo" v={formatARS(cash.efectivo)} />
            <Stat k="Mercado Pago" v={formatARS(cash.mp)} />
            <Stat k="Débito" v={formatARS(cash.debito)} />
            <Stat k="Retiros" v={formatARS(cash.drops)} />
            <Stat k="Devoluciones" v={formatARS(cash.refunds)} />
          </dl>
        </section>

        <section className="flex flex-col rounded-xl bg-surface p-6 shadow-[var(--shadow-border)]">
          <h2 className="font-display text-xl tracking-tight">Turno de caja</h2>
          {cash.open ? (
            <>
              <p className="mt-2 text-sm text-muted">
                Abierta a las {formatTime(cash.open.openedAt)} · fondo {formatARS(cash.open.openingCash)}
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-8">
                <Button variant="secondary" onClick={() => setDropOpen(true)}>
                  <Landmark className="size-4" />
                  Retiro a fuerte
                </Button>
                <Button variant="paper" onClick={() => setCloseOpen(true)}>
                  <Lock className="size-4" />
                  Cerrar y cuadrar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-5">
                <Label>Fondo inicial</Label>
                <Input
                  inputMode="numeric"
                  value={openAmt}
                  onChange={(e) => setOpenAmt(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
              <Button
                className="mt-4"
                onClick={() => {
                  const r = openShift(Number(openAmt) || 0);
                  if (!r.ok) toast.error(r.error);
                  else toast.success("Caja abierta");
                }}
              >
                <Unlock className="size-4" />
                Abrir caja
              </Button>
            </>
          )}
        </section>
      </div>

      <section className="rounded-xl bg-surface p-6 shadow-[var(--shadow-border)]">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Historial</h2>
        <ul className="mt-4 flex flex-col gap-2">
          {shifts.slice(0, 24).map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-bg px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium">
                  {s.status === "open" ? "Turno abierto" : "Turno cerrado"}
                </div>
                <div className="text-[11px] text-subtle">
                  {formatTime(s.openedAt)}
                  {s.closedAt ? ` → ${formatTime(s.closedAt)}` : ""}
                  {s.note ? ` · ${s.note}` : ""}
                </div>
              </div>
              <div className="num text-sm text-sage">
                {s.status === "closed"
                  ? `Dif. ${formatARS((s.closingCash ?? 0) - (s.expectedCash ?? 0))}`
                  : formatARS(s.openingCash)}
              </div>
            </li>
          ))}
        </ul>
        {drops.length ? (
          <div className="mt-4">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Retiros</h3>
            <ul className="mt-2 flex flex-col gap-1">
              {drops.slice(0, 8).map((d) => (
                <li key={d.id} className="flex justify-between text-sm">
                  <span className="text-muted">{d.note}</span>
                  <span className="num">{formatARS(d.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {refunds.length ? (
          <div className="mt-4">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Devoluciones</h3>
            <ul className="mt-2 flex flex-col gap-1">
              {refunds.slice(0, 8).map((r) => (
                <li key={r.id} className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-muted">
                    {r.kind === "proveedor" ? r.supplierName : "Cliente"} · {r.productName} · {r.units} u.
                  </span>
                  <span className="num shrink-0">{formatARS(r.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
        <EncargadoBook defaultOpen />
        <PriceCalcCard />
      </div>

      <Dialog open={dropOpen} onOpenChange={setDropOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retiro a caja fuerte</DialogTitle>
            <DialogDescription>Sale de la caja chica, no de las ventas digitales.</DialogDescription>
          </DialogHeader>
          <Label>Monto</Label>
          <Input
            inputMode="numeric"
            value={dropAmt}
            onChange={(e) => setDropAmt(e.target.value.replace(/[^\d]/g, ""))}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDropOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const r = addDrop(Number(dropAmt) || 0);
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success("Retiro registrado");
                  setDropAmt("");
                  setDropOpen(false);
                }
              }}
            >
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar turno</DialogTitle>
            <DialogDescription>
              Esperado en caja chica: {formatARS(cash.cajaChica)}. Las recargas de celular y SUBE
              se hacen en otra app — acá solo anotás cuánto fue.
            </DialogDescription>
          </DialogHeader>
          <Label>Efectivo contado (caja chica)</Label>
          <Input
            inputMode="numeric"
            value={closeAmt}
            onChange={(e) => setCloseAmt(e.target.value.replace(/[^\d]/g, ""))}
          />
          <Label className="mt-2">Caja fuerte (contado)</Label>
          <Input
            inputMode="numeric"
            value={safeAmt}
            onChange={(e) => setSafeAmt(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Lo que hay en el ahorro"
          />
          <Label className="mt-2">Cargas virtuales · celular</Label>
          <Input
            inputMode="numeric"
            value={celAmt}
            onChange={(e) => setCelAmt(e.target.value.replace(/[^\d]/g, ""))}
          />
          <Label className="mt-2">Cargas SUBE</Label>
          <Input
            inputMode="numeric"
            value={subeAmt}
            onChange={(e) => setSubeAmt(e.target.value.replace(/[^\d]/g, ""))}
          />
          {closeAmt ? (
            <p
              className={cn(
                "mt-3 font-display text-3xl leading-none tracking-tight",
                (Number(closeAmt) || 0) - cash.cajaChica >= 0 ? "text-sage" : "text-danger",
              )}
            >
              {(Number(closeAmt) || 0) - cash.cajaChica >= 0 ? "Sobran " : "Faltan "}
              {formatARS(Math.abs((Number(closeAmt) || 0) - cash.cajaChica))}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCloseOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="paper"
              onClick={() => {
                const r = closeShift(Number(closeAmt) || 0, {
                  virtualCel: Number(celAmt) || 0,
                  virtualSube: Number(subeAmt) || 0,
                  safeCount: Number(safeAmt) || Number(closeAmt) || 0,
                });
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success("Turno cerrado");
                  setCloseAmt("");
                  setCelAmt("");
                  setSubeAmt("");
                  setSafeAmt("");
                  setCloseOpen(false);
                }
              }}
            >
              Cerrar caja
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.08em] text-subtle">{k}</dt>
      <dd className="num mt-0.5 text-base text-fg">{v}</dd>
    </div>
  );
}
