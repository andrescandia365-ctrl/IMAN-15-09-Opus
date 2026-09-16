import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import type { StoreMeta } from "@/lib/kiosk";
import type { MyAccess } from "@/lib/license";

export function HubScreen({
  access,
  stores,
  remaining,
  onEnter,
  onActivate,
  onRegisterMore,
  onTaller,
  onStudio,
}: {
  access: MyAccess;
  stores: StoreMeta[];
  remaining: number;
  onEnter: (id: string) => void;
  onActivate: () => void;
  onRegisterMore: () => void;
  onTaller?: () => void;
  onStudio?: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-fg">
      <div className="w-full max-w-md">
        <div className="ticket-grain rounded-2xl bg-paper p-6 text-ink shadow-[var(--shadow-ticket)]">
          <h1 className="text-center font-display text-4xl tracking-tight">IMAN</h1>
          <p className="mt-2 text-center text-sm tracking-wide text-ink-muted">
            Números claros. Local que crece.
          </p>
        </div>

        <section className="mt-6 rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">Entrar a un local</p>
          {stores.length ? (
            <ul className="mt-3 space-y-1">
              {stores.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onEnter(s.id)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-3 text-left hover:bg-elevated"
                  >
                    <span>
                      <span className="block text-sm font-medium">{s.alias || s.name}</span>
                      {s.alias && s.alias !== s.name ? (
                        <span className="block text-xs text-subtle">{s.name}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-sage">Abrir</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Todavía no hay un local registrado.</p>
          )}
          {remaining > 0 ? (
            <Button variant="secondary" className="mt-3 w-full" onClick={onRegisterMore}>
              Registrar {remaining === 1 ? "el local que falta" : `${remaining} locales que faltan`}
            </Button>
          ) : null}
        </section>

        <section className="mt-3 rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">Activar</p>
          <p className="mt-2 text-sm text-muted">
            Un código nuevo alarga el plan o suma puertas si el pack las trae.
          </p>
          <Button variant="secondary" className="mt-3 w-full" onClick={onActivate}>
            Activar con un código
          </Button>
          {access.license?.active ? (
            <p className="mt-3 text-xs text-subtle">
              Plan hasta {new Date(access.license.expiresAt).toLocaleDateString("es-AR")} ·{" "}
              {access.license.seats} {access.license.seats === 1 ? "local" : "locales"}
            </p>
          ) : null}
        </section>

        {onStudio ? (
          <Button variant="paper" className="mt-3 w-full" onClick={onStudio}>
            Volver al Estudio
          </Button>
        ) : null}
        {access.isVendor && onTaller ? (
          <Button variant="ghost" className="mt-3 w-full" onClick={onTaller}>
            Taller IMAN
          </Button>
        ) : null}

        <button
          type="button"
          className="mt-6 w-full text-center text-sm text-muted hover:text-fg"
          onClick={() => void signOut()}
        >
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}
