import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { BootScreen } from "@/components/boot-screen";
import { EstudioCrm } from "@/components/estudio-crm";
import { EstudioGate } from "@/components/estudio-gate";
import { isFounderEmail } from "@/lib/founder-public";
import { getMyAccess, type MyAccess } from "@/lib/license";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { errorText } from "@/lib/errors";

export function EstudioScreen() {
  const { user, isPending } = useCurrentUserState();
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const founder = isFounderEmail(user?.primaryEmail);

  useEffect(() => {
    if (!founder) {
      setAccess(null);
      setLoadError(null);
      return;
    }
    let live = true;
    setLoadError(null);
    void getMyAccess()
      .then((next) => {
        if (live) setAccess(next);
      })
      .catch((err) => {
        if (!live) return;
        setAccess(null);
        setLoadError(errorText(err, "No se pudo abrir el taller"));
      });
    return () => {
      live = false;
    };
  }, [founder]);

  if (isPending) return <BootScreen />;
  if (!founder) return <EstudioGate />;
  if (loadError) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
        <div className="w-full max-w-sm rounded-xl bg-surface p-5 text-sm shadow-[var(--shadow-border)]">
          <p className="text-danger">{loadError}</p>
          <p className="mt-3 text-muted">Volvé a entrar al Estudio con el mail y la clave.</p>
        </div>
      </main>
    );
  }
  if (!access) return <BootScreen />;

  return (
    <>
      <EstudioCrm access={access} onAccess={setAccess} />
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
