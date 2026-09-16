import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bootstrapStore } from "@/lib/kiosk";
import { AR_CITIES } from "@/lib/cities";
import { RUBROS } from "@/lib/seed";
import { snapshotKiosk, useImanStore } from "@/lib/store";
import type { KioskRubro } from "@/lib/types";
import { cn } from "@/lib/utils";

export function OnboardingScreen() {
  const applyOnboarding = useImanStore((s) => s.applyOnboarding);
  const [name, setName] = useState("");
  const [rubro, setRubro] = useState<KioskRubro>("kiosco");
  const [city, setCity] = useState("");
  const [catalog, setCatalog] = useState<"example" | "empty">("example");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    applyOnboarding({ name: n, rubro, city, catalog });
    try {
      await bootstrapStore({ data: snapshotKiosk(useImanStore.getState()) });
    } catch (err) {
      console.error("[kiosk] save failed", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-fg">
      <form onSubmit={(e) => void onSubmit(e)} className="w-full max-w-md">
        <div className="ticket-grain rounded-2xl bg-paper p-6 text-ink shadow-[var(--shadow-ticket)]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-muted">Tu local</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight">Cómo se llama el comercio</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Un dueño, un mostrador. Después entra el código que pagaste — sin eso no abre la caja.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="local-name">Nombre del local</Label>
            <Input
              id="local-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kiosco San Martín"
              maxLength={40}
              required
              autoFocus
            />
          </div>

          <div>
            <Label>Rubro</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {RUBROS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRubro(r.id)}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-left shadow-[var(--shadow-border)] transition-colors duration-150",
                    rubro === r.id ? "bg-accent text-accent-fg" : "bg-elevated hover:bg-surface",
                  )}
                >
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className={cn("mt-0.5 block text-xs", rubro === r.id ? "opacity-80" : "text-subtle")}>
                    {r.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="local-city">Ciudad de este local</Label>
            <Input
              id="local-city"
              list="iman-cities"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Rosario, Santa Fe"
              maxLength={40}
            />
            <datalist id="iman-cities">
              {AR_CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <fieldset>
            <Label>Catálogo</Label>
            <div className="mt-1.5 grid gap-2">
              <button
                type="button"
                onClick={() => setCatalog("example")}
                className={cn(
                  "rounded-lg px-3 py-3 text-left shadow-[var(--shadow-border)]",
                  catalog === "example" ? "bg-accent text-accent-fg" : "bg-elevated",
                )}
              >
                <span className="block text-sm font-medium">Arrancar con productos de ejemplo</span>
                <span className={cn("mt-0.5 block text-xs", catalog === "example" ? "opacity-80" : "text-subtle")}>
                  Cigarrillos, bebidas, almacén. Precios de muestra para probar el mostrador. Las ventas empiezan en cero.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCatalog("empty")}
                className={cn(
                  "rounded-lg px-3 py-3 text-left shadow-[var(--shadow-border)]",
                  catalog === "empty" ? "bg-accent text-accent-fg" : "bg-elevated",
                )}
              >
                <span className="block text-sm font-medium">Empezar vacío</span>
                <span className={cn("mt-0.5 block text-xs", catalog === "empty" ? "opacity-80" : "text-subtle")}>
                  Cargás vos los productos en Inventario.
                </span>
              </button>
            </div>
          </fieldset>

          <Button type="submit" className="w-full" size="lg" disabled={busy || !name.trim()}>
            {busy ? "Guardando…" : "Continuar al plan"}
          </Button>
        </div>
      </form>
    </main>
  );
}
