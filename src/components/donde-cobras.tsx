import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { anotarCaja } from "@/lib/caja-local";
import { AVISO_CELU_CAJA, AVISO_CELU_PASAR, AVISO_CELU_PASAR_ACA, COBRA_EN, type CobraEn } from "@/lib/cobra-en";
import { usePhoneUi } from "@/lib/device";
import { errorText } from "@/lib/errors";
import { responderCobraEn, verCobraEn } from "@/lib/kiosk";
import { getDeviceId } from "@/lib/local-db";
import { cn } from "@/lib/utils";

/**
 * "¿Dónde vas a cobrar?", la primera vez que se entra a un local que no la
 * contestó. Una cuenta nueva no pasa por el asistente de locales (el servidor
 * le crea "Local" solo), así que la pregunta vive acá. "Después" la deja para
 * la próxima vez: nadie queda trabado con un cliente enfrente.
 */
export function DondeCobras({ storeId }: { storeId: string }) {
  const celu = usePhoneUi();
  const [open, setOpen] = useState(false);
  const [eleccion, setEleccion] = useState<CobraEn | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preguntado = useRef("");

  useEffect(() => {
    if (!storeId || preguntado.current === storeId || !navigator.onLine) return;
    preguntado.current = storeId;
    void verCobraEn({ data: { storeId } })
      .then((v) => {
        if (v === null) setOpen(true);
      })
      .catch(() => {});
  }, [storeId]);

  async function responder(v: CobraEn) {
    setEleccion(v);
    setBusy(true);
    try {
      const r = await responderCobraEn({ data: { storeId, cobraEn: v, device: getDeviceId(), esCelu: celu } });
      anotarCaja(storeId, r.caja);
      if (v === "celu") {
        setAviso(r.asignada ? AVISO_CELU_CAJA : celu ? AVISO_CELU_PASAR_ACA : AVISO_CELU_PASAR);
        return;
      }
      setOpen(false);
    } catch (err) {
      toast.error(errorText(err, "No se pudo guardar"));
      setEleccion(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Dónde vas a cobrar?</DialogTitle>
          <DialogDescription>Una sola vez por local. Se puede cambiar después desde Dueño.</DialogDescription>
        </DialogHeader>
        {aviso ? (
          <>
            <p role="status" className="rounded-md bg-sage/15 px-3 py-2.5 text-sm">
              {aviso}
            </p>
            <Button onClick={() => setOpen(false)}>Listo</Button>
          </>
        ) : (
          <>
            <div role="radiogroup" aria-label="¿Dónde vas a cobrar?" className="grid gap-1.5">
              {COBRA_EN.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={eleccion === o.id}
                  disabled={busy}
                  onClick={() => void responder(o.id)}
                  className={cn(
                    "h-12 rounded-md px-3 text-left text-sm font-medium",
                    eleccion === o.id ? "bg-accent text-accent-fg" : "bg-elevated text-fg",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Después
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
