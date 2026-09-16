import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/password-field";
import { errorText } from "@/lib/errors";

function spanish(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("token") || m.includes("expired") || m.includes("invalid")) {
    return "Ese enlace ya no vale. Pedí uno nuevo.";
  }
  if (m.includes("short") || m.includes("password")) return "Mínimo 8 caracteres.";
  return message || "No se pudo";
}

export function RecoverScreen({
  token,
  invalid,
}: {
  token?: string;
  invalid?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(invalid ? "Ese enlace ya no vale. Pedí uno nuevo." : null);
  const [done, setDone] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (password !== again) {
      setError("Las dos claves no coinciden.");
      return;
    }
    if (password.length < 8) {
      setError("Mínimo 8 caracteres.");
      return;
    }
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      const res = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (res.error) throw new Error(res.error.message || "No se pudo");
      setDone(true);
    } catch (err) {
      setError(spanish(errorText(err, "No se pudo")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-fg">
      <div className="w-full max-w-sm">
        <div className="ticket-grain rounded-2xl bg-paper p-6 text-ink shadow-[var(--shadow-ticket)]">
          <h1 className="text-center font-display text-4xl tracking-tight">IMAN</h1>
          <p className="mt-2 text-center text-sm tracking-wide text-ink-muted">
            {token ? "Nueva clave" : "Recuperar clave"}
          </p>
        </div>

        {token && done ? (
          <div className="mt-6 rounded-xl bg-surface p-5 text-sm shadow-[var(--shadow-border)]">
            <p>Listo. Entrá con la clave nueva.</p>
            <Link to="/login" className="mt-3 block text-sage">
              Ir a entrar
            </Link>
          </div>
        ) : token ? (
          <form onSubmit={(e) => void save(e)} className="mt-6 space-y-3">
            <div>
              <Label htmlFor="new-pass">Clave nueva</Label>
              <PasswordField
                id="new-pass"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="new-pass2">Repetir</Label>
              <PasswordField
                id="new-pass2"
                required
                minLength={8}
                value={again}
                onChange={(e) => setAgain(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Guardando…" : "Guardar clave"}
            </Button>
          </form>
        ) : (
          <div className="mt-6 rounded-xl bg-surface p-5 text-sm shadow-[var(--shadow-border)]">
            <p>
              El código de 6 dígitos por mail es solo para recuperar clave y resetear PIN. Todavía no
              hay envío de mail: el reset lo hace el Estudio.
            </p>
            <p className="mt-3 text-muted">Pedile a IMAN la clave nueva. El PIN también se resetea ahí.</p>
            <Link to="/login" className="mt-4 block text-sage">
              Volver a entrar
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
