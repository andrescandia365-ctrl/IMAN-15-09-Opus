import { useState } from "react";
import { AlertTriangle, ChevronLeft, FileUp, Tags, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImportDialog } from "@/components/inventory-view";
import { PriceUpdateCard } from "@/components/price-calc";
import { applyCatalogPreview } from "@/lib/catalog-io";
import { useImanStore } from "@/lib/store";

/**
 * La pestaña Más del celu cuando es la caja: lo que se usa menos que cobrar y
 * la caja, para que entren cinco pestañas. Llegó y Vence son las mismas
 * pantallas de siempre; Actualizar precios e Importar son las de la PC.
 */
export function PhoneMasView() {
  const setView = useImanStore((s) => s.setView);
  const products = useImanStore((s) => s.products);
  const categories = useImanStore((s) => s.categories);
  const importCatalog = useImanStore((s) => s.importCatalog);
  const [precios, setPrecios] = useState(false);
  const [importar, setImportar] = useState(false);

  if (precios) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto">
        <Button variant="secondary" className="self-start" onClick={() => setPrecios(false)}>
          <ChevronLeft className="size-4" />
          Más
        </Button>
        <PriceUpdateCard />
      </div>
    );
  }

  const items = [
    { label: "Llegó", detalle: "Recibir la mercadería", icon: Truck, hacer: () => setView("orders") },
    { label: "Vence", detalle: "Lo que se vence pronto", icon: AlertTriangle, hacer: () => setView("expire") },
    { label: "Actualizar precios", detalle: "Con la boleta del proveedor", icon: Tags, hacer: () => setPrecios(true) },
    { label: "Importar catálogo", detalle: "Desde un archivo de planilla", icon: FileUp, hacer: () => setImportar(true) },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto">
      <h2 className="px-1 font-display text-2xl tracking-tight">Más</h2>
      <ul className="flex flex-col gap-2">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.label}>
              <button
                type="button"
                onClick={it.hacer}
                className="flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-4 text-left shadow-[var(--shadow-border)]"
              >
                <Icon className="size-5 shrink-0 text-sage" />
                <span className="min-w-0">
                  <span className="block font-medium">{it.label}</span>
                  <span className="block text-sm text-muted">{it.detalle}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <ImportDialog
        open={importar}
        onOpenChange={setImportar}
        onApply={(rows) => {
          const next = applyCatalogPreview(rows, products, categories);
          importCatalog(next.products, next.categories);
          toast.success(`${rows.length} filas aplicadas`);
        }}
      />
    </div>
  );
}
