import { useEffect, useRef, useState, type RefObject } from "react";
import { crearPresencia, pausaEntreCuadros, recorteVisible } from "@/lib/escaneo";

type Detector = {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue?: string }[]>;
};
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];
/** Ancho máximo del recorte que se manda a leer: más no mejora un código de góndola y cuesta más. */
const ANCHO_MAX = 960;

export type EstadoCamara = "arrancando" | "leyendo" | "sin-lector" | "sin-permiso";

/**
 * Cámara que lee códigos. Manda a leer solo lo que se ve del video en pantalla,
 * va tan rápido como el celu banque (ver `pausaEntreCuadros`) y avisa cada
 * código una vez mientras siga a la vista (ver `crearPresencia`). Se apaga al
 * desmontar.
 */
export function useCamaraLectora(
  videoRef: RefObject<HTMLVideoElement | null>,
  opts: { onLeido: (codigo: string) => void; pausada?: boolean },
): EstadoCamara {
  const [estado, setEstado] = useState<EstadoCamara>("arrancando");
  const onLeido = useRef(opts.onLeido);
  const pausada = useRef(Boolean(opts.pausada));
  onLeido.current = opts.onLeido;
  pausada.current = Boolean(opts.pausada);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let dead = false;
    const presencia = crearPresencia();
    const lienzo = document.createElement("canvas");
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (dead) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (!Ctor || !ctx) {
          setEstado("sin-lector");
          return;
        }
        const det = new Ctor({ formats: FORMATOS });
        setEstado("leyendo");
        const tick = async () => {
          if (dead) return;
          if (pausada.current || video.readyState < 2 || !video.videoWidth || !video.clientWidth) {
            timer = window.setTimeout(() => void tick(), pausaEntreCuadros(0));
            return;
          }
          const t0 = performance.now();
          try {
            const r = recorteVisible(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight);
            const k = Math.min(1, ANCHO_MAX / r.ancho);
            lienzo.width = Math.round(r.ancho * k);
            lienzo.height = Math.round(r.alto * k);
            ctx.drawImage(video, r.x, r.y, r.ancho, r.alto, 0, 0, lienzo.width, lienzo.height);
            const hits = await det.detect(lienzo);
            const codigos = hits.map((h) => h.rawValue?.trim() ?? "").filter(Boolean);
            if (!dead) for (const c of presencia.cuadro(codigos)) onLeido.current(c);
          } catch {
            /* el próximo cuadro */
          }
          if (!dead) timer = window.setTimeout(() => void tick(), pausaEntreCuadros(performance.now() - t0));
        };
        void tick();
      } catch {
        if (!dead) setEstado("sin-permiso");
      }
    })();

    return () => {
      dead = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [videoRef]);

  return estado;
}

/** Aviso que se siente sin mirar: corto si leyó, tres golpes si no está cargado. */
export function vibrar(ok: boolean): void {
  try {
    navigator.vibrate?.(ok ? 35 : [60, 50, 60]);
  } catch {
    /* sin vibrador */
  }
}
