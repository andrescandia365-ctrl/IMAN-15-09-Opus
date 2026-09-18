import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lotsOf, soonestExpiry } from "@/lib/lots";
import type { Product } from "@/lib/types";

/** "2026-09-25" → "25/09/2026", sin pasar por Date: una fecha sola no tiene zona horaria. */
function fechaCorta(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : ymd;
}

/**
 * El vencimiento en los editores de producto. Sin lotes es la fecha del
 * producto y se edita acá, como siempre. Con lotes sale del que vence primero
 * y se carga desde Vence: un input acá no haría nada, porque guardar el
 * producto ya no pisa la fecha de los lotes.
 */
export function VenceField({
  product,
  onChange,
}: {
  product: Product;
  onChange: (expiresAt: string | null) => void;
}) {
  const lots = lotsOf(product);
  if (!lots.length) {
    return (
      <div>
        <Label>Vence</Label>
        <Input type="date" value={product.expiresAt ?? ""} onChange={(e) => onChange(e.target.value || null)} />
      </div>
    );
  }
  const fecha = soonestExpiry(product);
  return (
    <div>
      <Label>Vence</Label>
      <div
        className="flex h-11 items-center gap-2 rounded-md bg-bg px-3.5 text-muted shadow-[var(--shadow-border)]"
        aria-readonly="true"
      >
        <Lock className="size-4 shrink-0" />
        <span className="num text-[15px] text-fg">{fecha ? fechaCorta(fecha) : "—"}</span>
      </div>
      <p className="mt-1 text-[11px] text-subtle">
        {lots.length === 1 ? "Tiene 1 lote con fecha." : `Tiene ${lots.length} lotes con fecha.`} Se cargan desde
        Vence, en el celu.
      </p>
    </div>
  );
}
