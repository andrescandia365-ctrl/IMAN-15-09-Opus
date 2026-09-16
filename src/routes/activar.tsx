import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ActivateScreen } from "@/components/activate-screen";
import { BootScreen } from "@/components/boot-screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyAccess, type MyAccess } from "@/lib/license";
import { savePendingCode } from "@/lib/pending-code";
import { formatLicenseInput } from "@/lib/plan";

export const Route = createFileRoute("/activar")({
  validateSearch: (search: Record<string, unknown>): { codigo?: string } => ({
    ...(typeof search.codigo === "string" && search.codigo ? { codigo: search.codigo } : {}),
  }),
  component: Activar,
});

function Activar() {
  const { codigo } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    if (codigo) savePendingCode(codigo);
  }, [codigo]);

  if (isPending) return <BootScreen />;
  if (!user) return <SignedOutActivate initial={codigo ?? ""} />;
  return <SignedInActivate />;
}

function SignedOutActivate({ initial }: { initial: string }) {
  const [code, setCode] = useState(() => (initial ? formatLicenseInput(initial) : ""));

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-fg">
      <div className="w-full max-w-md">
        <div className="ticket-grain rounded-2xl bg-paper p-6 text-ink shadow-[var(--shadow-ticket)]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-muted">Ya pagué</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight">Activar el pack</h1>
          <p className="mt-3 text-sm text-ink-muted">
            Primero el código, después la cuenta. Mail y contraseña. Sin código al registrarte.
          </p>
        </div>
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) savePendingCode(code);
            window.location.assign("/login?alta=1");
          }}
        >
          <div>
            <Label htmlFor="act-code">Código</Label>
            <Input
              id="act-code"
              value={code}
              onChange={(e) => setCode(formatLicenseInput(e.target.value))}
              placeholder="IMAN-XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              className="mt-1.5 h-14 font-mono text-lg tracking-widest"
            />
          </div>
          <Button type="submit" className="w-full" size="lg">
            Entrar y activar
          </Button>
        </form>
        <Link to="/login" className="mt-4 block text-center text-sm text-muted hover:text-fg">
          Ya tengo cuenta
        </Link>
      </div>
    </main>
  );
}

function SignedInActivate() {
  const [access, setAccess] = useState<MyAccess | null>(null);

  useEffect(() => {
    void getMyAccess()
      .then(setAccess)
      .catch(() => setAccess(null));
  }, []);

  if (!access) return <BootScreen />;

  return (
    <ActivateScreen
      access={access}
      onAccess={(next) => {
        setAccess(next);
        window.location.assign("/");
      }}
    />
  );
}
