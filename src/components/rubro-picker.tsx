import { Label } from "@/components/ui/label";
import { ultimoRubro } from "@/lib/producto-nuevo";
import { useImanStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * El rubro de un producto, de un toque. Decide el margen y la factura, así
 * que en un alta no viene puesto: se elige siempre. El último usado en este
 * aparato va primero, sin marcar.
 */
export function RubroPicker({
  value,
  onChange,
  nuevo,
  className,
}: {
  value: string;
  onChange: (categoryId: string) => void;
  /** Alta: ordena con el último rubro usado primero. */
  nuevo: boolean;
  className?: string;
}) {
  const categories = useImanStore((s) => s.categories);
  const falta = !value;
  const ultimo = nuevo ? ultimoRubro() : "";
  const rubros = [...categories].sort((a, b) => (a.id === ultimo ? -1 : b.id === ultimo ? 1 : 0));
  if (!rubros.length) {
    return (
      <p className={cn("text-sm text-muted", className)}>
        Todavía no hay rubros cargados: el producto queda sin rubro por ahora.
      </p>
    );
  }
  return (
    <div className={className}>
      <Label className={cn(falta && "text-warn")}>{falta ? "Rubro · elegilo" : "Rubro"}</Label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {rubros.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={value === c.id}
            onClick={() => onChange(c.id)}
            className={cn(
              "h-10 rounded-full px-3.5 text-sm font-medium",
              value === c.id
                ? "bg-accent text-accent-fg"
                : falta
                  ? "bg-elevated text-fg ring-1 ring-warn/60"
                  : "bg-elevated text-muted",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
