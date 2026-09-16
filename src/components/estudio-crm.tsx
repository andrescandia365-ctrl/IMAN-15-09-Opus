import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { VendorPanel } from "@/components/vendor-panel";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import {
  grantExtraLocal,
  listCrmUsers,
  resetOwnerPassword,
  resetOwnerPin,
  type CrmUser,
} from "@/lib/crm";
import type { MyAccess } from "@/lib/license";
import { MAX_LOCALES } from "@/lib/plan";
import { errorText } from "@/lib/errors";

export function EstudioCrm({
  access,
  onAccess,
}: {
  access: MyAccess;
  onAccess: (next: MyAccess) => void;
}) {
  const user = useCurrentUser();
  const [rows, setRows] = useState<CrmUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, string>>({});

  function reload() {
    void listCrmUsers()
      .then((list) => {
        setRows(list);
        setError(null);
      })
      .catch((err) => setError(errorText(err, "No se pudo cargar el taller")));
  }

  useEffect(() => {
    reload();
  }, []);

  function patch(next: CrmUser) {
    setRows((prev) => (prev ? prev.map((r) => (r.id === next.id ? next : r)) : prev));
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-sage">CRM · un solo taller</p>
            <h1 className="mt-1 font-display text-3xl tracking-tight">Estudio IMAN</h1>
            <p className="mt-1 text-sm text-muted">
              Dueños reales. Neon guarda. Acá se opera. El cliente no entra por esta URL.
            </p>
            <p className="mt-1 truncate text-xs text-subtle">{user?.primaryEmail || user?.displayName}</p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row">
            <Button variant="paper" asChild>
              <Link to="/">Abrir IMAN</Link>
            </Button>
            <Button variant="ghost" onClick={() => void signOut("/estudio")}>
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
        <section className="rounded-xl bg-paper p-5 text-ink shadow-[var(--shadow-ticket)]">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Usuarios</p>
          <h2 className="mt-1 font-display text-2xl tracking-tight">Cuentas de dueño</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Mail, plan, días, locales. Extra hasta {MAX_LOCALES}. Reset de clave y PIN, hasta que
            exista el envío de mail.
          </p>
        </section>

        {error ? (
          <p className="rounded-xl bg-surface p-4 text-sm text-danger shadow-[var(--shadow-border)]">
            {error}
          </p>
        ) : rows == null ? (
          <p className="text-sm text-muted">Cargando cuentas…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl bg-surface p-5 text-sm text-muted shadow-[var(--shadow-border)]">
            Todavía no hay dueños. El alta es mail y clave en Entrar, no acá.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <p className="font-medium">{row.name}</p>
                  <p className="truncate text-sm text-muted">{row.email}</p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-subtle">Plan</dt>
                    <dd className="mt-0.5">{row.plan}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-subtle">Días</dt>
                    <dd className="mt-0.5 num">{row.daysLeft}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-subtle">Locales</dt>
                    <dd className="mt-0.5 num">
                      {row.locales} / {row.seatsAllowed}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-subtle">Extra</dt>
                    <dd className="mt-0.5 num">{row.extraSeats}</dd>
                  </div>
                </dl>
                {flash[row.id] ? (
                  <p className="mt-3 rounded-md bg-dato px-3 py-2 text-sm text-dato-fg">
                    Clave nueva: <span className="font-mono">{flash[row.id]}</span>
                  </p>
                ) : null}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy !== null || !row.canAddLocal}
                    onClick={() => {
                      setBusy(`extra:${row.id}`);
                      void grantExtraLocal({ data: { userId: row.id } })
                        .then((next) => {
                          patch(next);
                          toast.success("Local extra habilitado");
                        })
                        .catch((err) => toast.error(errorText(err, "No se pudo")))
                        .finally(() => setBusy(null));
                    }}
                  >
                    {row.canAddLocal ? "Habilitar local extra" : "Techo 5"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => {
                      setBusy(`pass:${row.id}`);
                      void resetOwnerPassword({ data: { userId: row.id } })
                        .then((r) => {
                          setFlash((prev) => ({ ...prev, [row.id]: r.password }));
                          toast.success("Clave reseteada. Decile la nueva al dueño.");
                        })
                        .catch((err) => toast.error(errorText(err, "No se pudo")))
                        .finally(() => setBusy(null));
                    }}
                  >
                    Reset clave
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => {
                      setBusy(`pin:${row.id}`);
                      void resetOwnerPin({ data: { userId: row.id } })
                        .then((r) => {
                          toast.success(
                            r.stores
                              ? "PIN borrado. El dueño pone uno nuevo al entrar a Dueño."
                              : "Esa cuenta todavía no tiene local.",
                          );
                        })
                        .catch((err) => toast.error(errorText(err, "No se pudo")))
                        .finally(() => setBusy(null));
                    }}
                  >
                    Reset PIN
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div id="iman-tienda">
          <VendorPanel access={access} onAccess={onAccess} />
        </div>
      </main>
    </div>
  );
}
