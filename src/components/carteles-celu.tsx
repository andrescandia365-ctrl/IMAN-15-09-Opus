import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CartelEditor, type CartelPreset } from "@/components/cartel-editor";
import { SugerenciasPanel } from "@/components/sugerencias-panel";
import { cn } from "@/lib/utils";

/** Los carteles en el celu: pantalla entera, con el armador y las sugerencias en pestañas. */
export function CartelesCelu({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"armar" | "sugerencias">("armar");
  const [preset, setPreset] = useState<CartelPreset | null>(null);
  return (
    // Por encima de la barra de pestañas (z-40): si no, tapa los botones de abajo.
    <div className="fixed inset-0 z-50 flex flex-col bg-bg pb-[env(safe-area-inset-bottom)]" role="dialog" aria-label="Carteles">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-display text-2xl tracking-tight">Carteles</h2>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
      <div className="flex shrink-0 gap-1.5 px-4 pt-3" role="tablist">
        {(
          [
            ["armar", "Armar cartel"],
            ["sugerencias", "Qué promocionar"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("h-10 flex-1 rounded-full text-sm font-medium", tab === id ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* El armador queda montado: volver de las sugerencias no pierde lo cargado. */}
        <div className={cn(tab !== "armar" && "hidden")}>
          <CartelEditor preset={preset} />
        </div>
        {tab === "sugerencias" ? (
          <SugerenciasPanel
            columna
            onArmar={(s) => {
              setPreset({ plantilla: s.plantilla, productId: s.productId, n: Date.now() });
              setTab("armar");
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
