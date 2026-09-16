import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOut } from "@/lib/auth/client";
import { redeemLicense, type MyAccess } from "@/lib/license";
import { clearPendingCode, readPendingCode, savePendingCode } from "@/lib/pending-code";
import { formatLicenseInput } from "@/lib/plan";
import { errorText } from "@/lib/errors";

export function ActivateScreen({
  access,
  onAccess,
}: {
  access: MyAccess;
  onAccess: (next: MyAccess) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"code" | "out" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expired = Boolean(access.license && !access.license.active);
  const trialOver = Boolean(access.trial && !access.trial.active && !access.license?.active);
  const shop = access.salesUrl;

  useEffect(() => {
    const pending = readPendingCode();
    if (pending) setCode(formatLicenseInput(pending));
  }, []);

  async function onRedeem(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("code");
    try {
      savePendingCode(code);
      const next = await redeemLicense({ data: { code } });
      if (!next.license?.active && !next.isVendor) {
        throw new Error("El código no dejó el plan activo");
      }
      clearPendingCode();
      onAccess(next);
      toast.success("Plan activado");
    } catch (err) {
      setError(errorText(err, "No se pudo activar"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-dvh bg-bg px-4 py-10 text-fg">
      <div className="mx-auto w-full max-w-md">
        <div className="ticket-grain rounded-2xl bg-paper p-6 text-ink shadow-[var(--shadow-ticket)]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-muted">
            Producto de pago
          </p>
          <h1 className="mt-2 font-display text-3xl tracking-tight">
            {trialOver
              ? "Día 20. Código de plan"
              : expired
                ? "Se venció el período"
                : "Ya pagué — activar"}
          </h1>
          <p className="mt-3 text-sm text-ink-muted">
            {trialOver
              ? "Los datos del local siguen. El mostrador no se apaga si estás en la fila. Para seguir, activá el pack."
              : "El código llega en el mail de la compra. Empieza con IMAN- y cuatro grupos."}
          </p>
        </div>

        <form onSubmit={(e) => void onRedeem(e)} className="mt-6 rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <Label htmlFor="license-code">Código de licencia IMAN</Label>
          <Input
            id="license-code"
            value={code}
            onChange={(e) => setCode(formatLicenseInput(e.target.value))}
            placeholder="IMAN-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className="mt-1.5 h-14 font-mono text-lg tracking-widest"
          />
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          <Button type="submit" className="mt-4 w-full" size="lg" disabled={busy !== null}>
            {busy === "code" ? "Activando…" : "Activar el mostrador"}
          </Button>
          {shop ? (
            <a
              href={shop}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block text-center text-sm text-sage hover:underline"
            >
              Comprar el pack en la tienda
            </a>
          ) : (
            <p className="mt-3 text-center text-xs text-subtle">
              Si todavía no pagaste, no hay código.
            </p>
          )}
        </form>

        <div className="mt-6 flex flex-col items-center gap-3 text-sm">
          <Link to="/terminos" className="text-muted hover:text-fg">
            Condiciones de uso
          </Link>
          <button
            type="button"
            className="text-muted hover:text-fg"
            disabled={busy !== null}
            onClick={() => {
              setBusy("out");
              void signOut("/").catch(() => setBusy(null));
            }}
          >
            {busy === "out" ? "Saliendo…" : "Cerrar sesión"}
          </button>
        </div>
      </div>
    </main>
  );
}
