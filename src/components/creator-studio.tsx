import { Button } from "@/components/ui/button";
import { VendorDashboardView } from "@/components/vendor-dashboard";
import { VendorPanel } from "@/components/vendor-panel";
import { CreatorNotes } from "@/components/creator-notes";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { MyAccess } from "@/lib/license";

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
        <div id="iman-tienda">
          <VendorPanel access={access} onAccess={onAccess} />
        </div>

        <VendorDashboardView />
        <CreatorNotes />
      </main>
    </div>
  );
}
