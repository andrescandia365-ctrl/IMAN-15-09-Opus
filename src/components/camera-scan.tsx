import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Detector = {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue?: string }[]>;
};

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
  const [err, setErr] = useState("");
  const onCodeRef = useRef(onCode);
  const onCloseRef = useRef(onClose);
  const stayOpenRef = useRef(stayOpen);
  onCodeRef.current = onCode;
  onCloseRef.current = onClose;
  stayOpenRef.current = stayOpen;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let dead = false;
    let last = "";

    const DetectorCtor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => Detector })
      .BarcodeDetector;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (dead) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (!DetectorCtor) {
          setErr("Este celular no lee códigos con la cámara. Escribí el número.");
          return;
        }
        const det = new DetectorCtor({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
        });
        const tick = async () => {
          if (dead || video.readyState < 2) {
            timer = window.setTimeout(() => void tick(), 280);
            return;
          }
          try {
            const hits = await det.detect(video);
            const raw = hits[0]?.rawValue?.trim();
            if (raw && raw !== last) {
              last = raw;
              onCodeRef.current(raw);
              if (!stayOpenRef.current) {
                onCloseRef.current();
                return;
              }
              window.setTimeout(() => {
                if (last === raw) last = "";
              }, 1100);
            }
          } catch {
            /* next frame */
          }
          timer = window.setTimeout(() => void tick(), 280);
        };
        void tick();
      } catch {
        setErr("Sin permiso de cámara. Activala para este sitio.");
        toast.error("Sin cámara");
      }
    })();

    return () => {
      dead = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
