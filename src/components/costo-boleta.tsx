import { type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatARS } from "@/lib/format";
import {
  BOLETA_A,
  BOLETA_X,
  POR_UNIDAD,
  QUE_NUMERO,
  porUnidad,
  recordatorioBulto,
  recordatorioCosto,
} from "@/lib/costo-guia";
import { invoiceForProduct, type InvoiceKind } from "@/lib/pricing";
import { packOf } from "@/lib/pack";
import type { Product, Supplier } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Diálogo de ejemplo de boleta: el mismo de Actualizar precios. */
export function BoletaCostoDialog({
  openKind,
  onOpenKind,
  onCloseAutoFocus,
}: {
  openKind: InvoiceKind | null;
  onOpenKind: (k: InvoiceKind | null) => void;
  onCloseAutoFocus?: (e: Event) => void;
}) {
  return (
    <Dialog open={openKind != null} onOpenChange={(v) => !v && onOpenKind(null)}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Qué número copiar de la boleta</DialogTitle>
          <DialogDescription>Una boleta de ejemplo. El renglón resaltado es el que va en el costo.</DialogDescription>
        </DialogHeader>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["A", "X"] as InvoiceKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={cn(
                "h-10 rounded-md text-sm font-medium",
                openKind === k ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
              )}
              onClick={() => onOpenKind(k)}
            >
              Factura {k}
            </button>
          ))}
        </div>
        {openKind === "A" ? (
          <BoletaEjemplo
            titulo="Factura A"
            renglones={[
              ["Cantidad", `${BOLETA_A.unidades} unidades`],
              ["Neto", formatARS(BOLETA_A.neto)],
              ["Impuestos internos", formatARS(BOLETA_A.internos)],
              ["Subtotal", formatARS(BOLETA_A.subtotal), true],
              ["IVA 21%", formatARS(BOLETA_A.iva)],
              ["TOTAL", formatARS(BOLETA_A.total)],
            ]}
            cuenta={`Costo por unidad = ${formatARS(BOLETA_A.subtotal)} ÷ ${BOLETA_A.unidades} = ${formatARS(porUnidad(BOLETA_A.subtotal, BOLETA_A.unidades))}`}
            nota="Ojo: los impuestos internos SÍ van. El IVA NO."
          />
        ) : openKind === "X" ? (
          <BoletaEjemplo
            titulo="Factura X"
            renglones={[
              ["Cantidad", `${BOLETA_X.unidades} unidades`],
              ["TOTAL", formatARS(BOLETA_X.total), true],
            ]}
            cuenta={`Costo por unidad = ${formatARS(BOLETA_X.total)} ÷ ${BOLETA_X.unidades} = ${formatARS(porUnidad(BOLETA_X.total, BOLETA_X.unidades))}`}
            nota="Acá va todo lo que pagaste. No se descuenta nada."
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BoletaEjemplo({
  titulo,
  renglones,
  cuenta,
  nota,
}: {
  titulo: string;
  renglones: [string, string, boolean?][];
  cuenta: string;
  nota: string;
}) {
  return (
    <div className="mt-3">
      <div className="ticket-grain rounded-lg bg-paper px-4 py-3 text-ink shadow-[var(--shadow-ticket)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">Boleta de ejemplo · {titulo}</p>
        <ul className="mt-2 flex flex-col gap-0.5">
          {renglones.map(([nombre, valor, este]) => (
            <li
              key={nombre}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm",
                este ? "bg-dato font-semibold text-dato-fg" : "text-ink-muted",
              )}
            >
              <span>
                {nombre}
                {este ? <span className="ml-2 text-[11px] font-medium uppercase tracking-[0.08em]">← este</span> : null}
              </span>
              <span className="num">{valor}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="num mt-3 text-sm font-medium">{cuenta}</p>
      <p className="mt-1 text-sm text-muted">{nota}</p>
    </div>
  );
}

const LARGO_CODIGO = 8;

/** Costo opcional al recibir: mismo recordatorio y campo de bulto que Actualizar precios. */
export function CostoEnLlegada({
  product,
  suppliers,
  costo,
  bulto,
  avisos,
  precioNuevo,
  onCosto,
  onBulto,
  onScan,
  onAskBoleta,
  ticket,
}: {
  product: Product | undefined;
  suppliers: Supplier[];
  costo: string;
  bulto: string;
  avisos: string[];
  precioNuevo: number | null;
  onCosto: (v: string) => void;
  onBulto: (v: string) => void;
  onScan: (raw: string) => boolean;
  onAskBoleta: (kind: InvoiceKind) => void;
  ticket?: boolean;
}) {
  const pack = packOf(product);
  const fac = product ? (invoiceForProduct(product, suppliers)?.invoice ?? null) : null;
  const muted = ticket ? "text-ink-muted" : "text-muted";

  function maybeScan(raw: string, e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return false;
    if (raw.length >= LARGO_CODIGO && onScan(raw)) {
      e.preventDefault();
      return true;
    }
    e.preventDefault();
    return false;
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-xs leading-snug", muted)}>{recordatorioCosto(fac)}</p>
        <button
          type="button"
          className={cn("shrink-0 text-[11px] underline underline-offset-2", muted, ticket ? "hover:text-ink" : "hover:text-fg")}
          onClick={() => onAskBoleta(fac ?? "X")}
        >
          {QUE_NUMERO}
        </button>
      </div>
      <p className={cn("text-[11px]", muted)}>{POR_UNIDAD}</p>
      {pack > 1 ? <p className={cn("text-[11px]", muted)}>{recordatorioBulto(pack)}</p> : null}
      <div className={cn("grid gap-2", pack > 1 ? "grid-cols-2" : "grid-cols-1")}>
        {pack > 1 ? (
          <div>
            <Label className={ticket ? "text-ink-muted" : undefined}>Costo del bulto</Label>
            <Input
              inputMode="numeric"
              placeholder="opcional"
              value={bulto}
              autoComplete="off"
              className={ticket ? "h-11 bg-paper text-ink" : "h-11"}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                onBulto(v);
                onCosto(v ? String(porUnidad(Number(v), pack)) : "");
              }}
              onKeyDown={(e) => maybeScan(bulto, e)}
            />
          </div>
        ) : null}
        <div>
          <Label className={ticket ? "text-ink-muted" : undefined}>Costo por unidad</Label>
          <Input
            inputMode="numeric"
            placeholder="opcional"
            value={costo}
            autoComplete="off"
            className={ticket ? "h-11 bg-paper text-ink" : "h-11"}
            onChange={(e) => {
              onCosto(e.target.value.replace(/[^\d]/g, ""));
              onBulto("");
            }}
            onKeyDown={(e) => maybeScan(costo, e)}
          />
        </div>
      </div>
      {bulto && pack > 1 ? (
        <p className={cn("num text-[11px]", muted)}>
          {formatARS(Number(bulto))} ÷ {pack} = {formatARS(porUnidad(Number(bulto), pack))}
        </p>
      ) : null}
      {precioNuevo != null && costo ? (
        <p className={cn("text-xs", muted)}>
          A góndola {formatARS(precioNuevo)} · sale del margen, no se escribe
        </p>
      ) : null}
      {avisos.map((a) => (
        <p key={a} className="text-xs text-warn">
          {a}
        </p>
      ))}
    </div>
  );
}

export function ScanPedidoField({
  value,
  onChange,
  onScan,
  ticket,
}: {
  value: string;
  onChange: (v: string) => void;
  onScan: (raw: string) => boolean;
  ticket?: boolean;
}) {
  return (
    <div className="mb-3">
      <Label className={ticket ? "text-ink-muted" : undefined}>Escaneá el código</Label>
      <Input
        inputMode="numeric"
        placeholder="Busca el renglón de este pedido"
        value={value}
        autoComplete="off"
        className={ticket ? "mt-1 h-11 bg-paper text-ink" : "mt-1 h-11"}
        onChange={(e) => onChange(e.target.value.replace(/\s/g, ""))}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const raw = value.trim();
          if (!raw) return;
          if (onScan(raw)) onChange("");
        }}
      />
    </div>
  );
}
