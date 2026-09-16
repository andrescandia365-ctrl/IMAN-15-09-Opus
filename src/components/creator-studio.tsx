import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VendorDashboardView } from "@/components/vendor-dashboard";
import { VendorPanel } from "@/components/vendor-panel";
import { CreatorNotes } from "@/components/creator-notes";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { purgeForgottenAccounts, type MyAccess } from "@/lib/license";
import { errorText } from "@/lib/errors";

export function CreatorStudio({
  access,
  onAccess,
  onOpenFloor,
}: {
  access: MyAccess;
  onAccess: (next: MyAccess) => void;
  onOpenFloor: () => void;
}) {
  const user = useCurrentUser();
  const [phrase, setPhrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-sage">Creador · no es el kiosco</p>
            <h1 className="mt-1 font-display text-3xl tracking-tight">Estudio IMAN</h1>
            <p className="mt-1 text-sm text-muted">
              Códigos, 10 mil, manuales. El mostrador se abre aparte, para mirar y corregir.
            </p>
            <p className="mt-1 truncate text-xs text-subtle">{user?.primaryEmail || user?.displayName}</p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row">
            <Button variant="paper" onClick={onOpenFloor}>
              Abrir IMAN
            </Button>
            <Button variant="ghost" onClick={() => void signOut("/")}>
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
        <section className="rounded-xl bg-paper p-5 text-ink shadow-[var(--shadow-ticket)]">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Corregir el producto</p>
          <h2 className="mt-1 font-display text-2xl tracking-tight">Mostrador, caja, stock, dueño</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Abre un local de prueba en esta cuenta. No es un dueño de verdad. Volvés al Estudio cuando
            termines.
          </p>
          <Button className="mt-4" variant="secondary" onClick={onOpenFloor}>
            Abrir IMAN
          </Button>
        </section>
        <section className="rounded-xl border border-warn/40 bg-warn/10 p-5">
          <h2 className="font-display text-xl tracking-tight">Cuentas que no recordás</h2>
          <p className="mt-2 text-sm text-muted">
            Borra todas las cuentas menos esta. Esta deja de ser un kiosco. Los códigos no usados
            quedan. Escribí la frase y LIMPIAR IMAN.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <Label>Frase</Label>
              <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
            </div>
            <div>
              <Label>Confirmar</Label>
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="LIMPIAR IMAN"
                autoComplete="off"
              />
            </div>
          </div>
          <Button
            className="mt-3"
            variant="danger"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void purgeForgottenAccounts({ data: { phrase, confirm } })
                .then((r) => {
                  toast.success(
                    r.removed === 0
                      ? "No había otras cuentas. Este estudio quedó limpio."
                      : `Listo. Se fueron ${r.removed} cuentas.`,
                  );
                  setPhrase("");
                  setConfirm("");
                  onAccess({ ...access, isVendor: true });
                })
                .catch((err) => toast.error(errorText(err, "No se pudo")))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Borrando…" : "Borrar las otras cuentas"}
          </Button>
        </section>

        <div id="iman-tienda">
          <VendorPanel access={access} onAccess={onAccess} />
        </div>

        <VendorDashboardView />
        <CreatorNotes />
      </main>
    </div>
  );
}
