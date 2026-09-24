import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ultimoRubro } from "@/lib/producto-nuevo";
import { useImanStore } from "@/lib/store";
import { cn, uid } from "@/lib/utils";

/**
 * El rubro de un producto, de un toque. Decide el margen y la factura, así
 * que en un alta no viene puesto: se elige siempre. El último usado en este
 * aparato va primero, sin marcar.
 *
 * Desde acá se crea un rubro nuevo: un kiosco que solo tiene celular no tiene
 * otro lugar donde crearlos (Categorías está en el Inventario de la PC).
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
  const saveCategory = useImanStore((s) => s.saveCategory);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const falta = !value && categories.length > 0;
  const ultimo = nuevo ? ultimoRubro() : "";
  const rubros = [...categories].sort((a, b) => (a.id === ultimo ? -1 : b.id === ultimo ? 1 : 0));

  function crear() {
    const n = nombre.trim();
    if (!n) return;
    // Si ya existe con ese nombre, se elige: no se duplica.
    const igual = categories.find((c) => c.name.trim().toLowerCase() === n.toLowerCase());
    if (igual) {
      onChange(igual.id);
    } else {
      const id = uid("c");
      saveCategory({ id, name: n, sort: 0 });
      onChange(id);
    }
    setNombre("");
    setCreando(false);
  }

  return (
    <div className={className}>
      <Label className={cn(falta && "text-warn")}>{falta ? "Rubro · elegilo" : "Rubro"}</Label>
      {!rubros.length ? (
        <p className="mt-1 text-sm text-muted">Todavía no hay rubros: creá el primero acá abajo.</p>
      ) : null}
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
        {creando ? null : (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="inline-flex h-10 items-center gap-1 rounded-full border border-dashed border-border px-3.5 text-sm font-medium text-muted"
          >
            <Plus className="size-4" />
            Rubro nuevo
          </button>
        )}
      </div>
      {creando ? (
        <div className="mt-2 flex gap-2">
          <label htmlFor="rubro-nuevo" className="sr-only">
            Nombre del rubro nuevo
          </label>
          <Input
            id="rubro-nuevo"
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value.slice(0, 40))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                crear();
              }
              if (e.key === "Escape") {
                e.stopPropagation();
                setCreando(false);
              }
            }}
            placeholder="Golosinas, Bebidas…"
          />
          <Button type="button" onClick={crear} disabled={!nombre.trim()}>
            Crear
          </Button>
        </div>
      ) : null}
    </div>
  );
}
