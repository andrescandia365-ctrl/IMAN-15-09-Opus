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
import { PasswordField } from "@/components/password-field";
import { hashPin, pinLooksOk, unlockOwner } from "@/lib/owner-pin";
import { useImanStore } from "@/lib/store";

export function OwnerPinDialog({
  open,
  mode,
  onClose,
  onOk,
}: {
  open: boolean;
  mode: "create" | "enter";
  onClose: () => void;
  onOk: () => void;
}) {
  const saveSettings = useImanStore((s) => s.saveSettings);
  const hash = useImanStore((s) => s.settings.ownerPinHash);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!pinLooksOk(pin)) {
      toast.error("La clave son 4 a 8 números.");
      return;
    }
    setBusy(true);
    try {
      const next = await hashPin(pin);
      if (mode === "create") {
        if (pin !== again) {
          toast.error("Las dos claves no coinciden.");
          return;
        }
        saveSettings({ ownerPinHash: next });
        unlockOwner();
        toast.success("Clave del dueño lista. El encargado no la necesita para vender.");
        onOk();
        return;
      }
      if (!hash || next !== hash) {
        toast.error("Clave incorrecta.");
        return;
      }
      unlockOwner();
      onOk();
    } finally {
      setBusy(false);
      setPin("");
      setAgain("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Creá la clave del dueño" : "Clave del dueño"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "El encargado vende y hace caja sin clave. Esta llave abre números, planilla del mes y el plan."
              : "Solo el dueño. El mostrador sigue sin esto."}
          </DialogDescription>
        </DialogHeader>
        <PasswordField
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="4 a 8 números"
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
        {mode === "create" ? (
          <div className="mt-2">
            <PasswordField
              inputMode="numeric"
              autoComplete="off"
              value={again}
              onChange={(e) => setAgain(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="Repetir"
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
        ) : null}
        <Button className="mt-4 w-full" disabled={busy} onClick={() => void submit()}>
          {mode === "create" ? "Guardar clave" : "Entrar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
