import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { formatARS, todayKey } from "@/lib/format";
import { vigente } from "@/lib/promos";
import { useImanStore } from "@/lib/store";
import {
  noSeVenden,
  porVencer,
  SIN_VENTA_DEFAULT,
  SIN_VENTA_DIAS,
  VENCE_DEFAULT,
  VENCE_DIAS,
  type Sugerencia,
} from "@/lib/sugerencias";
import { cn } from "@/lib/utils";

/**
 * Qué conviene promocionar, al costado de los carteles: lo que vence pronto y
 * lo que no se vende, por plata en riesgo. Los plazos los elige el dueño con
 * un toque y quedan guardados por local. Lo que ya está en una promo vigente
 * no aparece.
 */
export function SugerenciasPanel({ onArmar, columna }: { onArmar?: (s: Sugerencia) => void; columna?: boolean }) {
  const products = useImanStore((s) => s.products);
  const promos = useImanStore((s) => s.promos);
  const lastSold = useImanStore((s) => s.lastSold);
  const desde = useImanStore((s) => s.lastSoldSince);
  const vence = useImanStore((s) => s.settings.sugVence ?? VENCE_DEFAULT);
  const sinVenta = useImanStore((s) => s.settings.sugSinVenta ?? SIN_VENTA_DEFAULT);
  const saveSettings = useImanStore((s) => s.saveSettings);
  const hoy = todayKey();
  // Hace cuántos días se anotan las ventas en este local: antes no se sabe.
  const anotaHace = desde ? Math.floor((Date.now() - new Date(desde).getTime()) / 86_400_000) : 0;
  const desdeDia = desde
    ? `${String(new Date(desde).getDate()).padStart(2, "0")}/${String(new Date(desde).getMonth() + 1).padStart(2, "0")}`
    : "";

  const { vencen, quietos } = useMemo(() => {
    const enPromo = new Set(promos.filter((p) => vigente(p, hoy)).flatMap((p) => p.items.map((it) => it.productId)));
    const libres = products.filter((p) => !enPromo.has(p.id));
    const vencen = porVencer(libres, hoy, vence);
    const quietos = noSeVenden(libres, lastSold, desde, hoy, sinVenta, new Set(vencen.map((s) => s.productId)));
    return { vencen, quietos };
  }, [products, promos, lastSold, desde, hoy, vence, sinVenta]);

  return (
    <div className={cn("grid gap-3", !columna && "lg:grid-cols-2")}>
      <Lista
        titulo="Por vencer"
        sugiere="Liquidación"
        plazo={vence}
        opciones={VENCE_DIAS}
        etiqueta={(d) => `${d} días`}
        onPlazo={(d) => saveSettings({ sugVence: d })}
        items={vencen}
        vacio={`Nada vence en los próximos ${vence} días.`}
        onArmar={onArmar}
      />
      <Lista
        titulo="No se venden"
        sugiere="Oferta o Combo"
        plazo={sinVenta}
        opciones={SIN_VENTA_DIAS}
        etiqueta={(d) => `${d} días`}
        onPlazo={(d) => saveSettings({ sugSinVenta: d })}
        items={quietos}
        vacio={
          anotaHace < sinVenta
            ? `Las ventas de cada producto se anotan desde el ${desdeDia}. Lo que no se vende en ${sinVenta} días aparece cuando pasen.`
            : `Todo lo que tiene stock se vendió en los últimos ${sinVenta} días.`
        }
        onArmar={onArmar}
      />
    </div>
  );
}

function Lista({
  titulo,
  sugiere,
  plazo,
  opciones,
  etiqueta,
  onPlazo,
  items,
  vacio,
  onArmar,
}: {
  titulo: string;
  sugiere: string;
  plazo: number;
  opciones: readonly number[];
  etiqueta: (d: number) => string;
  onPlazo: (d: number) => void;
  items: Sugerencia[];
  vacio: string;
  onArmar?: (s: Sugerencia) => void;
}) {
  return (
    <section className="rounded-xl bg-elevated p-3" aria-label={titulo}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-lg leading-tight">{titulo}</p>
          <p className="text-xs text-muted">Sugiere {sugiere}</p>
        </div>
        <div className="flex gap-1" role="radiogroup" aria-label={`${titulo}: plazo`}>
          {opciones.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={plazo === d}
              onClick={() => onPlazo(d)}
              className={cn(
                "h-8 rounded-full px-2.5 text-xs font-medium",
                plazo === d ? "bg-accent text-accent-fg" : "bg-surface text-muted",
              )}
            >
              {etiqueta(d)}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 rounded-lg bg-surface px-3 py-4 text-center text-sm text-subtle">{vacio}</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {items.slice(0, 20).map((s) => (
            <li key={s.productId} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.nombre}</p>
                <p className="text-xs text-muted">{s.motivo}</p>
              </div>
              <div className="shrink-0 text-right">
                {s.plata != null ? (
                  <p className="num text-sm font-medium text-warn">
                    {formatARS(s.plata)} <span className="font-sans text-[10px] font-normal text-subtle">en riesgo</span>
                  </p>
                ) : (
                  <p className="text-xs text-subtle">sin costo cargado</p>
                )}
                {s.costo != null ? <p className="num text-[11px] text-subtle">Costo {formatARS(s.costo)}</p> : null}
              </div>
              {onArmar ? (
                <Button size="sm" variant="secondary" onClick={() => onArmar(s)}>
                  Armar cartel
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
