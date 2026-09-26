import { Button } from "@/components/ui/button";
import { formatARS, todayKey } from "@/lib/format";
import { cartelesPorSacar, PROMO_NOMBRE, type Cobro } from "@/lib/promos";
import { useImanStore } from "@/lib/store";

/** Las promos que la caja va a aplicar a este ticket, arriba del total. */
export function PromosAplicadas({ cobro }: { cobro: Cobro }) {
  if (!cobro.aplicadas.length) return null;
  return (
    <ul className="mt-2 space-y-0.5 border-t border-dashed border-ink/20 pt-2 text-xs" aria-label="Promos del ticket">
      {cobro.aplicadas.map((a) => (
        <li key={a.promoId} className="flex justify-between gap-2">
          <span className="min-w-0 truncate">
            <span className="font-medium text-danger">{PROMO_NOMBRE[a.kind]}</span> {a.name}
            {a.kind === "combo" || a.kind === "2x1" ? ` ×${a.veces}` : ""}
          </span>
          <span className="num shrink-0 text-danger">−{formatARS(a.ahorro)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Terminó una promo: la caja ya cobra el precio de góndola, y el cartel sigue
 * pegado. Avisa hasta que alguien toca "Ya lo saqué" (sin PIN: es un aviso).
 */
export function AvisoCartelesPorSacar() {
  const promos = useImanStore((s) => s.promos);
  const savePromo = useImanStore((s) => s.savePromo);
  const porSacar = cartelesPorSacar(promos, todayKey());
  if (!porSacar.length) return null;
  return (
    <div className="mx-3 mt-3 space-y-1.5 sm:mx-5" role="status">
      {porSacar.slice(0, 3).map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <span className="min-w-0">
            Terminó {PROMO_NOMBRE[p.kind].toLowerCase()} {p.name}: la caja ya cobra el precio normal. Sacá el cartel.
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-danger"
            onClick={() => savePromo({ ...p, retiradaAt: new Date().toISOString() })}
          >
            Ya lo saqué
          </Button>
        </div>
      ))}
    </div>
  );
}
