import { useRef, useState } from "react";
import { Camera, ImageOff, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/errors";
import { borrarFoto, guardarFoto, prepararFoto, useFoto } from "@/lib/fotos";
import { useImanStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * La foto del producto para los carteles: se saca con la cámara o se sube de
 * un archivo, se recorta sola al cuadrado y queda guardada en este aparato
 * para el próximo cartel. No viaja a los otros aparatos.
 */
export function FotoProducto({ productId, className }: { productId: string; className?: string }) {
  const storeId = useImanStore((s) => s.deskStoreId);
  const url = useFoto(storeId, productId);
  const camara = useRef<HTMLInputElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function usar(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await guardarFoto(storeId, productId, await prepararFoto(file));
      toast.success("Foto guardada en este aparato");
    } catch (err) {
      toast.error(errorText(err, "No se pudo usar esa foto"));
    } finally {
      setBusy(false);
      if (camara.current) camara.current.value = "";
      if (archivo.current) archivo.current.value = "";
    }
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-elevated">
        {url ? (
          <img src={url} alt="Foto del producto" className="size-full object-cover" />
        ) : (
          <ImageOff className="size-6 text-subtle" aria-label="Sin foto" />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => camara.current?.click()}>
            <Camera className="size-4" />
            Sacar foto
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => archivo.current?.click()}>
            <Upload className="size-4" />
            Subir
          </Button>
          {url ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void borrarFoto(storeId, productId).then(() => toast("Foto quitada"))}
            >
              Quitar
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] text-subtle">Para los carteles. Queda en este aparato.</p>
      </div>
      <input
        ref={camara}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Sacar foto con la cámara"
        onChange={(e) => void usar(e.target.files?.[0])}
      />
      <input
        ref={archivo}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Subir foto desde un archivo"
        onChange={(e) => void usar(e.target.files?.[0])}
      />
    </div>
  );
}
