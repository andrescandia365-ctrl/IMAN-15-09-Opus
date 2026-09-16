import { useState, type FormEvent } from "react";
import { authClient, captureLanSessionToken } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/password-field";
import { FOUNDER_EMAIL } from "@/lib/founder-public";
import { seedStudio } from "@/lib/license";

export function EstudioGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter(e: FormEvent) {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    if (!mail) {
      setError("Sin el mail no entra");
      return;
    }
    if (mail !== FOUNDER_EMAIL) {
      setError("Ese mail no es el del Estudio");
      return;
    }
    if (!password) {
      setError("Falta la clave");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const seed = await seedStudio();
      if (!seed.configured) {
        setError("Falta cargar la clave del Estudio en el servidor");
        setBusy(false);
        return;
      }
      const res = await authClient.signIn.email({
        email: FOUNDER_EMAIL,
        password,
        callbackURL: "/estudio",
      });
      if (res.error) {
        setError("Clave incorrecta");
        setBusy(false);
        return;
      }
      captureLanSessionToken(res.data?.token);
      await authClient.getSession();
      window.location.assign("/estudio");
    } catch {
      setError("No se pudo abrir el Estudio");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-fg">
      <div className="w-full max-w-sm">
        <div className="ticket-grain rounded-2xl bg-paper p-6 text-ink shadow-[var(--shadow-ticket)]">
          <p className="text-center text-[11px] uppercase tracking-[0.18em] text-ink-muted">
            Taller · no es el kiosco
          </p>
          <h1 className="mt-2 text-center font-display text-3xl tracking-tight">Estudio IMAN</h1>
          <p className="mt-2 text-center text-sm text-ink-muted">
            Mail y clave. El cliente no pasa por acá.
          </p>
        </div>
        <form
          method="post"
          action="#"
          onSubmit={(e) => {
            e.preventDefault();
            void enter(e);
          }}
          className="mt-6 space-y-3"
        >
          <div>
            <Label htmlFor="estudio-mail">Mail</Label>
            <Input
              id="estudio-mail"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="Mail del Estudio"
              name="email"
            />
          </div>
          <div>
            <Label htmlFor="estudio-pass">Clave</Label>
            <PasswordField
              id="estudio-pass"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Clave del Estudio"
              name="password"
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Abriendo…" : "Entrar al taller"}
          </Button>
        </form>
      </div>
    </main>
  );
}
