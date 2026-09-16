import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  authClient,
  authEnabled,
  captureLanSessionToken,
  GROK_PROVIDERS,
  signIn,
} from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/password-field";
import { readPendingCode, savePendingPhone, readPendingTrial } from "@/lib/pending-code";
import { formatPhoneInput } from "@/lib/phone";
import { claimOwner } from "@/lib/owners";
import { errorText } from "@/lib/errors";

const GOOGLE = GROK_PROVIDERS.find((p) => p.idp === "google");

/** Held only for the post-signup confirm screen so /login does not bounce away. */
let signupConfirmMail = "";

export function peekSignupConfirm(): string {
  return signupConfirmMail;
}

function spanishAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already") || m.includes("exist")) return "Ese email ya tiene cuenta";
  if (m.includes("invalid") || m.includes("password") || m.includes("credential")) {
    return "Email o contraseña incorrectos";
  }
  if (m.includes("popup")) return "No se pudo abrir la ventana";
  if (m.includes("client") || m.includes("oauth") || m.includes("origin")) {
    return "Google no está listo. Entrá con mail y contraseña.";
  }
  if (m.includes("mail en la cuenta") || m.includes("guardar") || m.includes("insert") || m.includes("neon")) {
    return "No se pudo guardar la cuenta. Reintentá.";
  }
  return message || "No se pudo entrar";
}

export function LoginScreen({
  initialMode = "in",
}: {
  initialMode?: "in" | "up";
  estudio?: boolean;
}) {
  const [pending, setPending] = useState("");
  const [trial, setTrial] = useState(false);
  const [mode, setMode] = useState<"in" | "up">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmMail, setConfirmMail] = useState<string | null>(null);

  useEffect(() => {
    const code = readPendingCode();
    if (code) {
      setPending(code);
      setMode("up");
    }
    if (readPendingTrial()) {
      setTrial(true);
      setMode("up");
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("email");
    try {
      if (mode === "up") {
        const res = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim() || email.trim(),
          callbackURL: "/",
        });
        if (res.error) throw new Error(res.error.message || "No se pudo crear la cuenta");
        captureLanSessionToken(res.data?.token);
        if (phone.trim()) savePendingPhone(phone.trim());
        signupConfirmMail = email.trim();
        await authClient.getSession();
        await claimOwner({ data: { name: name.trim() } });
        setConfirmMail(email.trim());
        setBusy(null);
        return;
      }
      const res = await authClient.signIn.email({
        email: email.trim(),
        password,
        callbackURL: "/",
      });
      if (res.error) throw new Error(res.error.message || "Email o contraseña incorrectos");
      captureLanSessionToken(res.data?.token);
      await authClient.getSession();
      window.location.assign("/");
    } catch (err) {
      setError(spanishAuthError(errorText(err, "No se pudo entrar")));
      setBusy(null);
    }
  }

  async function onGoogle() {
    if (!GOOGLE) return;
    setError(null);
    setBusy("google");
    try {
      await signIn(GOOGLE.providerId, { callbackURL: "/" });
    } catch (err) {
      setError(spanishAuthError(errorText(err, "Google no está listo")));
      setBusy(null);
    }
  }

  if (confirmMail) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-fg">
        <div className="w-full max-w-sm">
          <div className="ticket-grain rounded-2xl bg-paper p-6 text-ink shadow-[var(--shadow-ticket)]">
            <h1 className="text-center font-display text-4xl tracking-tight">IMAN</h1>
            <p className="mt-2 text-center text-sm tracking-wide text-ink-muted">
              Confirmá el mail en pantalla
            </p>
          </div>
          <div className="mt-6 rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
            <p className="text-sm text-muted">Este es el mail de tu cuenta. Míralo.</p>
            <p className="mt-3 break-all font-medium">{confirmMail}</p>
            <p className="mt-3 text-sm text-muted">
              Con este mail entras en la PC y en el teléfono. No mandamos código al registrarte.
            </p>
            <Button
              className="mt-5 w-full"
              size="lg"
              onClick={() => {
                signupConfirmMail = "";
                window.location.assign("/");
              }}
            >
              Así está, seguir
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-fg">
      <div className="w-full max-w-sm">
        <div className="ticket-grain rounded-2xl bg-paper p-6 text-ink shadow-[var(--shadow-ticket)]">
          <h1 className="text-center font-display text-4xl tracking-tight">IMAN</h1>
          <p className="mt-2 text-center text-sm tracking-wide text-ink-muted">
            {trial ? "19 días de prueba. Un local." : "Números claros. Local que crece."}
          </p>
          {pending ? (
            <p className="mt-3 text-center text-sm text-ink-muted">
              Código {pending} listo. Ahora la cuenta del dueño.
            </p>
          ) : null}
        </div>

        {authEnabled ? (
          <>
            <form
              method="post"
              action="#"
              onSubmit={(e) => {
                e.preventDefault();
                void onSubmit(e);
              }}
              className="mt-6 space-y-3"
            >
              {mode === "up" ? (
                <>
                  <div>
                    <Label htmlFor="login-name">Nombre</Label>
                    <Input
                      id="login-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      placeholder="Dueño"
                      name="name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="login-phone">Teléfono</Label>
                    <Input
                      id="login-phone"
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                      autoComplete="tel"
                      placeholder="11 5555-1234"
                      name="phone"
                    />
                  </div>
                </>
              ) : null}
              <div>
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="vos@kiosco.com"
                  name="email"
                />
              </div>
              <div>
                <Label htmlFor="login-password">Contraseña</Label>
                <PasswordField
                  id="login-password"
                  required
                  minLength={7}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "up" ? "new-password" : "current-password"}
                  placeholder="Mínimo 7 caracteres"
                  name="password"
                />
              </div>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy !== null}>
                {busy === "email" ? "Entrando…" : mode === "up" ? "Registrar dueño" : "Entrar"}
              </Button>
            </form>

            {GOOGLE ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full"
                disabled={busy !== null}
                onClick={() => void onGoogle()}
              >
                {busy === "google" ? "Abriendo Google…" : "Entrar con Google"}
              </Button>
            ) : null}

            {mode === "in" ? (
              <Link to="/recuperar" className="mt-3 block text-center text-sm text-muted hover:text-fg">
                ¿Olvidaste la contraseña?
              </Link>
            ) : null}

            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-muted hover:text-fg"
              onClick={() => {
                setMode((m) => (m === "in" ? "up" : "in"));
                setError(null);
              }}
            >
              {mode === "in" ? "Crear cuenta con email" : "Ya tengo cuenta"}
            </button>
          </>
        ) : (
          <p className="mt-6 text-sm text-muted">El acceso está desactivado.</p>
        )}
      </div>
    </main>
  );
}
