import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { anotarCaja, anotarHeredados, useRol } from "@/lib/caja-local";
import { errorText } from "@/lib/errors";
import { detalleCaja, tomarCaja, verCaja, type DetalleCaja } from "@/lib/kiosk";
import { getDeviceId } from "@/lib/local-db";
import { hashPin, pinLooksOk } from "@/lib/owner-pin";
import { syncNow } from "@/lib/sync";
import { describirCaja, tipoDeEsteAparato } from "@/lib/tipo-aparato";

/**
 * Arriba de todo del panel del dueño, en PC y en celu: qué aparato es la caja
 * del local, en palabras, y pasarla a este sin entrar a Local. Pide red y el PIN del
 * dueño: lo decide el servidor (ver rol.ts y tomarCaja). Pasar exige el turno
 * cerrado en la caja de antes; si ese aparato se rompió o se perdió, se fuerza
 * la toma y el turno que quedó abierto se cierra acá contando la plata.
 */
export function CajaDelLocal({ storeId }: { storeId: string }) {
  const { rol, caja } = useRol(storeId);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  // El pase normal se frenó por un turno abierto: se ofrece forzar.
  const [frenado, setFrenado] = useState(false);
  // Tipo de aparato y desde cuándo: lo sabe el servidor. Sin red, lo que se sabe acá.
  const [detalle, setDetalle] = useState<DetalleCaja | null>(null);
  const ver = caja?.ver ?? 0;

  useEffect(() => {
    if (!storeId || !navigator.onLine) return;
    let vivo = true;
    void detalleCaja({ data: { storeId } })
      .then((d) => {
        if (vivo) setDetalle(d);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [storeId, ver]);

  const al = detalle && detalle.ver === ver ? detalle : null;
  const estado =
    rol === "sin-asignar"
      ? "Todavía no hay una caja anotada: cobra la computadora, como siempre."
      : describirCaja({ esEste: rol === "caja", tipo: al?.tipo ?? null, desde: al?.desde ?? null });

  async function tomar(forzar = false) {
    if (!pinLooksOk(pin)) {
      toast.error("El PIN tiene de 4 a 8 números");
      return;
    }
    if (!navigator.onLine) {
      toast.error("Sin red. La caja se toma con internet.");
      return;
    }
    setBusy(true);
    try {
      // La versión de ahora, no la que este aparato recuerda: si otro tomó la
      // caja y este no se enteró, igual se puede tomar sin un error confuso. Si
      // alguien la cambia entre esta consulta y la toma, la toma falla igual.
      const ahora = await verCaja({ data: { storeId } }).catch(() => caja);
      anotarCaja(storeId, ahora);
      const r = await tomarCaja({
        data: {
          storeId,
          device: getDeviceId(),
          esperado: ahora?.ver ?? 0,
          pinHash: await hashPin(pin),
          forzar,
          tipo: tipoDeEsteAparato(),
        },
      });
      anotarCaja(storeId, r.caja);
      if (!r.ok) {
        if (r.turnoAbierto) setFrenado(true);
        else toast.error(r.error);
        return;
      }
      anotarHeredados(storeId, r.heredados);
      // La caja nueva baja lo último antes de cobrar: si no, vería abierto el
      // turno que la caja de antes ya cerró (el servidor lo sabía por la cinta).
      await syncNow(storeId).catch(() => undefined);
      setOpen(false);
      setFrenado(false);
      setPin("");
      toast.success(
        r.heredados.length
          ? "Este aparato es la caja. Cerrá en Caja el turno que quedó abierto, contando la plata."
          : "Este aparato es la caja del local",
      );
    } catch (err) {
      toast.error(errorText(err, "No se pudo tomar la caja"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
      <p className="min-w-0 text-sm" data-caja-del-local>
        {rol === "sin-asignar" ? (
          estado
        ) : (
          <>
            <span className="text-muted">La caja de este local: </span>
            <span className="font-medium">{estado}</span>
          </>
        )}
      </p>
      {rol === "caja" ? null : (
        <Button size="sm" variant="secondary" className="max-sm:w-full" onClick={() => setOpen(true)}>
          Pasar la caja a este aparato
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (busy) return;
          setOpen(v);
          if (!v) setFrenado(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pasar la caja a este aparato</DialogTitle>
            <DialogDescription>
              Este aparato pasa a cobrar, abrir y cerrar el turno. El que era la caja deja de cobrar en
              cuanto se entere. Hace falta internet, y el turno cerrado en la caja de antes.
            </DialogDescription>
          </DialogHeader>
          {frenado ? (
            <div role="alert" className="rounded-md bg-warn/10 px-3 py-2.5 text-sm">
              <p className="font-medium text-warn">Hay un turno abierto en la caja de antes.</p>
              <p className="mt-1">
                Cerralo en ese aparato contando la plata y volvé a intentar. Si ese aparato se rompió o se
                perdió, forzá la toma: el turno abierto lo cerrás acá contando la plata del cajón, y lo que
                ese aparato no haya subido no llega.
              </p>
            </div>
          ) : null}
          <Label htmlFor="caja-pin">PIN del dueño</Label>
          <Input
            id="caja-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            {frenado ? (
              <Button variant="danger" onClick={() => void tomar(true)} disabled={busy}>
                {busy ? "Forzando…" : "Forzar la toma"}
              </Button>
            ) : (
              <Button onClick={() => void tomar()} disabled={busy}>
                {busy ? "Pasando…" : "Pasar la caja"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
