import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCamaraLectora } from "@/lib/camara-lectora";

export function CameraScan({
  onCode,
  onClose,
  stayOpen = false,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
  stayOpen?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cerrado = useRef(false);
  const estado = useCamaraLectora(videoRef, {
    onLeido: (codigo) => {
      if (cerrado.current) return;
      onCode(codigo);
      if (!stayOpen) {
        cerrado.current = true;
        onClose();
      }
    },
  });
  const err =
    estado === "sin-lector"
      ? "Este celular no lee códigos con la cámara. Escribí el número."
      : estado === "sin-permiso"
        ? "Sin permiso de cámara. Activala para este sitio."
        : "";

  useEffect(() => {
    if (estado === "sin-permiso") toast.error("Sin cámara");
  }, [estado]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-ink">
      <div className="flex items-center justify-between px-4 py-3 text-paper">
        <p className="font-display text-lg">{stayOpen ? "Seguí escaneando" : "Apuntá al código"}</p>
        <button type="button" className="grid size-10 place-items-center" onClick={onClose} aria-label="Cerrar">
          <X className="size-5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
        <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-px -translate-y-1/2 bg-sage" />
        <div className="pointer-events-none absolute inset-x-[12%] top-[30%] bottom-[30%] rounded-lg ring-2 ring-sage/80" />
      </div>
      <p className="px-4 py-4 text-center text-sm text-paper/80">
        {err || "EAN, pack o QR. Luz de frente, sin flash cegador."}
      </p>
      {err ? (
        <Button className="mx-4 mb-6" variant="paper" onClick={onClose}>
          Escribir el código
        </Button>
      ) : null}
    </div>
  );
}
