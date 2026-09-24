import { useRef } from "react";
import { useCamaraLectora } from "@/lib/camara-lectora";
import { cn } from "@/lib/utils";

export type AvisoEscaneo = { tipo: "ok" | "falta"; texto: string; codigo?: string };

/**
 * La cámara como franja arriba del ticket, no a pantalla completa: un código
 * de barras es ancho y bajo. Lee solo lo que se ve en la franja.
 *
 * El alto (40% del ancho) es el de partida: se ajusta cuando se mida en celus
 * reales qué es lo mínimo que sigue leyendo EAN y QR.
 */
export function ScanStrip({
  onLeido,
  pausada,
  aviso,
  onAlta,
}: {
  onLeido: (codigo: string) => void;
  pausada?: boolean;
  aviso: AvisoEscaneo | null;
  onAlta: (codigo: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const estado = useCamaraLectora(videoRef, { onLeido, pausada });
  const problema =
    estado === "sin-lector"
      ? "Este celular no lee códigos con la cámara. Escribí el número."
      : estado === "sin-permiso"
        ? "Sin permiso de cámara. Activala para este sitio."
        : "";

  return (
    <div className="relative aspect-[5/2] w-full shrink-0 overflow-hidden rounded-xl bg-ink">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
      {estado === "leyendo" ? (
        <div className="iman-scan-linea pointer-events-none absolute inset-x-[6%] h-0.5 rounded-full bg-sage shadow-[0_0_8px_var(--color-sage)]" />
      ) : null}
      {problema ? (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-paper/85">{problema}</p>
      ) : null}
      {aviso ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-[var(--shadow-ticket)]",
            aviso.tipo === "ok" ? "bg-paper text-ink" : "bg-danger text-white",
          )}
        >
          <span className="min-w-0 truncate">{aviso.texto}</span>
          {aviso.tipo === "falta" && aviso.codigo ? (
            <button
              type="button"
              className="h-9 shrink-0 rounded-md bg-white px-3 text-sm font-medium text-danger"
              onClick={() => onAlta(aviso.codigo!)}
            >
              Dar de alta
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
