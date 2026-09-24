import { useState } from "react";
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
import { anotarCaja, useRol } from "@/lib/caja-local";
import { errorText } from "@/lib/errors";
import { tomarCaja, verCaja } from "@/lib/kiosk";
import { getDeviceId } from "@/lib/local-db";
import { hashPin, pinLooksOk } from "@/lib/owner-pin";

/**
 * Qué aparato es la caja del local, y tomarla desde este. Tomarla pide red y
 * el PIN del dueño: lo decide el servidor (ver rol.ts y tomarCaja).
 */
export function CajaDelLocal({ storeId }: { storeId: string }) {
  const { rol, caja } = useRol(storeId);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const estado =
    rol === "caja"
      ? "Este aparato es la caja del local: cobra, abre y cierra el turno."
      : rol === "piso"
        ? "La caja es otro aparato. Este arma el ticket y lo manda a la caja."
        : "Sin caja asignada: cobra la computadora, como siempre.";

  async function tomar() {
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
        data: { storeId, device: getDeviceId(), esperado: ahora?.ver ?? 0, pinHash: await hashPin(pin) },
      });
      anotarCaja(storeId, r.caja);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setOpen(false);
      setPin("");
      toast.success("Este aparato es la caja del local");
    } catch (err) {
      toast.error(errorText(err, "No se pudo tomar la caja"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Caja del local</p>
      <p className="mt-2 text-sm">{estado}</p>
      {rol === "caja" ? null : (
        <Button className="mt-3 w-full" variant="secondary" onClick={() => setOpen(true)}>
          Tomar la caja en este aparato
        </Button>
      )}
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tomar la caja</DialogTitle>
            <DialogDescription>
              Este aparato pasa a cobrar, abrir y cerrar el turno. El que era la caja deja de cobrar en
              cuanto se entere. Hace falta internet.
            </DialogDescription>
          </DialogHeader>
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
            <Button onClick={() => void tomar()} disabled={busy}>
              {busy ? "Tomando…" : "Tomar la caja"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
