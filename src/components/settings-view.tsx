import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/password-field";
import { Switch } from "@/components/ui/switch";
import { AR_CITIES } from "@/lib/cities";
import { canThermalUsb, connectThermal, hasRememberedPrinter } from "@/lib/usb-print";
import { printTicket } from "@/lib/print";
import { hashPin, pinLooksOk } from "@/lib/owner-pin";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { formatDateLong, daysUntil } from "@/lib/format";
import { pushCopy } from "@/lib/sync";
import type { MyAccess } from "@/lib/license";
import { PLAN_LABEL, type PlanMonths } from "@/lib/plan";
import { RUBROS } from "@/lib/seed";
import { FISCAL_CONDITIONS } from "@/lib/fiscal";
import { useImanStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { LedgerRowsConfig } from "@/components/ledger-rows-config";

/**
 * Cambios del dueño que no viajan por la cinta (nombre, rubro, ciudad, el
 * catálogo de ejemplo): suben con la fotocopia, con su rev, así juntan en lugar
 * de pisar lo que otro aparato haya subido (invariante 5).
 */
function subirFotocopia(): Promise<unknown> {
  const storeId = useImanStore.getState().deskStoreId;
  return storeId ? pushCopy(storeId) : Promise.resolve();
}

export function SettingsView({ access }: { access: MyAccess }) {
  const settings = useImanStore((s) => s.settings);
  const saveSettings = useImanStore((s) => s.saveSettings);
  const loadExampleCatalog = useImanStore((s) => s.loadExampleCatalog);
  const clearExampleCatalog = useImanStore((s) => s.clearExampleCatalog);
  const [wipeAsk, setWipeAsk] = useState(false);
  const user = useCurrentUser();
  const [name, setName] = useState(settings.name);
  const [city, setCity] = useState(settings.city);
  const [taxName, setTaxName] = useState(settings.taxName ?? "IVA");
  const [taxPct, setTaxPct] = useState(String(settings.taxPct ?? 21));
  const [signingOut, setSigningOut] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [printerOk, setPrinterOk] = useState(false);
  const sales = useImanStore((s) => s.sales);

  useEffect(() => {
    void hasRememberedPrinter().then(setPrinterOk);
  }, []);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Cuenta</h2>
        <div className="mt-3 rounded-md bg-bg px-3 py-3">
          <p className="truncate text-sm font-medium">{user?.displayName || "Cuenta"}</p>
          {user?.primaryEmail ? (
            <p className="mt-0.5 truncate text-xs text-subtle">{user.primaryEmail}</p>
          ) : null}
        </div>
        <Button
          variant="secondary"
          className="mt-4"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void subirFotocopia()
              .catch((err) => console.error("[kiosk] save failed", err))
              .finally(() => {
                void signOut("/").catch(() => setSigningOut(false));
              });
          }}
        >
          {signingOut ? "Saliendo…" : "Cerrar sesión"}
        </Button>
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Plan</h2>
        {access.license?.active ? (
          <div className="mt-4 rounded-md bg-bg px-3 py-3 text-sm">
            <p>
              {PLAN_LABEL[access.license.months as PlanMonths] ?? `${access.license.months} meses`} ·
              vence {formatDateLong(access.license.expiresAt)}
            </p>
            <p className="mt-1 font-mono text-xs text-subtle">{access.license.code}</p>
            {daysUntil(access.license.expiresAt) != null && daysUntil(access.license.expiresAt)! <= 30 ? (
              <p className="mt-2 text-xs text-warn">Quedan pocos días. Renová con un código nuevo.</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 rounded-md bg-bg px-3 py-3 text-sm">Sin período activo.</p>
        )}
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Este local</h2>
        <div className="mt-4">
          <Label htmlFor="kiosk-name">Nombre del kiosco</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="kiosk-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
            />
            <Button
              className="sm:shrink-0"
              onClick={() => {
                const n = name.trim();
                if (!n) return;
                saveSettings({ name: n });
                toast.success("Nombre actualizado");
                void subirFotocopia().catch((err) => {
                  console.error("[kiosk] save failed", err);
                });
              }}
            >
              Guardar
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <Label>Rubro</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {RUBROS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  saveSettings({ rubro: r.id });
                  void subirFotocopia().catch(() => {});
                }}
                className={
                  settings.rubro === r.id
                    ? "rounded-md bg-accent px-3 py-2 text-sm text-accent-fg"
                    : "rounded-md bg-elevated px-3 py-2 text-sm text-muted hover:text-fg"
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="kiosk-city">Ciudad de este local</Label>
          <p className="mb-1 text-xs text-subtle">Sale en el ticket.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="kiosk-city"
              list="iman-cities"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={40}
              placeholder="Rosario, Santa Fe"
            />
            <datalist id="iman-cities">
              {AR_CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Button
              variant="secondary"
              className="sm:shrink-0"
              onClick={() => {
                saveSettings({ city: city.trim() });
                toast.success("Ciudad actualizada");
                void subirFotocopia().catch((err) => {
                  console.error("[kiosk] save failed", err);
                });
              }}
            >
              Guardar
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <Label>Cómo facturás</Label>
          <div className="mt-1.5 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            {FISCAL_CONDITIONS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => saveSettings({ fiscalCondition: c.id })}
                className={cn(
                  "h-11 rounded-md px-3 text-sm sm:h-auto sm:py-2",
                  (settings.fiscalCondition ?? "monotributo") === c.id
                    ? "bg-accent text-accent-fg"
                    : "bg-elevated text-muted hover:text-fg",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-subtle">
            {(settings.fiscalCondition ?? "monotributo") === "responsable_inscripto"
              ? "El impuesto de la góndola no es ganancia. El mes lo saca de las ventas."
              : "El mes mira la plata que entró."}
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_6.5rem]">
          <div>
            <Label htmlFor="tax-name">Impuesto</Label>
            <Input
              id="tax-name"
              value={taxName}
              maxLength={12}
              onChange={(e) => setTaxName(e.target.value)}
              onBlur={() => {
                const n = taxName.trim() || "IVA";
                setTaxName(n);
                if (n !== (settings.taxName ?? "IVA")) saveSettings({ taxName: n });
              }}
            />
          </div>
          <div>
            <Label htmlFor="tax-pct">Tasa %</Label>
            <Input
              id="tax-pct"
              inputMode="numeric"
              value={taxPct}
              onChange={(e) => setTaxPct(e.target.value.replace(/[^\d.,]/g, ""))}
              onBlur={() => {
                const n = Number(taxPct.replace(",", "."));
                const pct = Number.isFinite(n) && n >= 0 ? n : 0;
                setTaxPct(String(pct));
                if (pct !== (settings.taxPct ?? 21)) saveSettings({ taxPct: pct });
              }}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">El precio de la góndola ya tiene el impuesto</p>
            <p className="text-xs text-subtle">En Argentina, sí. No se recataloga al cambiarlo.</p>
          </div>
          <Switch
            checked={settings.shelfIncludesTax !== false}
            onCheckedChange={(v) => saveSettings({ shelfIncludesTax: v })}
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Tema claro</p>
            <p className="text-xs text-subtle">El mostrador queda en papel de día.</p>
          </div>
          <Switch
            checked={settings.theme === "light"}
            onCheckedChange={(v) => saveSettings({ theme: v ? "light" : "dark" })}
          />
        </div>
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Clave del dueño</h2>
        <p className="mt-2 text-xs text-subtle">
          {settings.ownerPinHash ? "Hay una clave cargada." : "Todavía no hay clave."}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <PasswordField
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="Nueva clave (4 a 8)"
            autoComplete="off"
          />
          <PasswordField
            inputMode="numeric"
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="Repetir"
            autoComplete="off"
          />
        </div>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => {
            if (!pinLooksOk(pin) || pin !== pin2) {
              toast.error("Dos veces la misma clave, 4 a 8 números.");
              return;
            }
            void hashPin(pin).then((h) => {
              saveSettings({ ownerPinHash: h });
              setPin("");
              setPin2("");
              toast.success("Clave actualizada");
            });
          }}
        >
          Guardar clave
        </Button>
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Impresora USB</h2>
        <p className="mt-2 text-xs text-subtle">
          {canThermalUsb()
            ? printerOk
              ? "Hay un puerto recordado."
              : "Todavía no hay impresora conectada."
            : "Este navegador no habla USB serie."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void connectThermal(settings.printerBaud ?? 9600).then((r) => {
                if (!r.ok) toast.error(r.error);
                else {
                  setPrinterOk(true);
                  toast.success("Impresora lista");
                }
              });
            }}
          >
            Conectar impresora
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const sale = sales[0];
              if (!sale) {
                toast.error("Hacé una venta de prueba y volvé.");
                return;
              }
              void printTicket({
                sale,
                store: settings.name,
                city: settings.city,
                baud: settings.printerBaud ?? 9600,
              }).then((ok) => {
                if (!ok) toast.error("No imprimió. Conectá la USB o permití el diálogo.");
                else toast.success("Ticket enviado");
              });
            }}
          >
            Probar ticket
          </Button>
        </div>
        <div className="mt-3">
          <Label>Baud</Label>
          <select
            className="mt-1 flex h-11 w-40 rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)]"
            value={String(settings.printerBaud ?? 9600)}
            onChange={(e) => saveSettings({ printerBaud: Number(e.target.value) || 9600 })}
          >
            <option value="9600">9600</option>
            <option value="19200">19200</option>
            <option value="115200">115200</option>
          </select>
        </div>
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Voz</h2>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="text-sm">Decir el precio al escanear</p>
            <p className="text-xs text-subtle">Español argentino. Un switch.</p>
          </div>
          <Switch
            checked={settings.voiceEnabled}
            onCheckedChange={(v) => saveSettings({ voiceEnabled: v })}
          />
        </div>
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Logo</h2>
        <div className="mt-3 flex items-center gap-3">
          {settings.storeLogo ? (
            <img src={settings.storeLogo} alt="" className="size-12 rounded-md object-cover" />
          ) : (
            <span className="grid size-12 place-items-center rounded-md bg-paper text-ink text-xs">IMAN</span>
          )}
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 400_000) {
                toast.error("La imagen es muy pesada");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => saveSettings({ storeLogo: String(reader.result ?? "") });
              reader.readAsDataURL(file);
            }}
          />
        </div>
        {settings.storeLogo ? (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => saveSettings({ storeLogo: "" })}>
            Quitar logo
          </Button>
        ) : null}
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Drive</h2>
        <p className="mt-2 text-sm text-muted">
          Carpeta IMAN / {settings.name || "el local"}. El CSV se baja a mano.
        </p>
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Caja e inventario</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <Label>Fondo habitual</Label>
            <Input
              inputMode="numeric"
              defaultValue={settings.cashFloat}
              onBlur={(e) => saveSettings({ cashFloat: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <Label>Llevar a fuerte al llegar a</Label>
            <Input
              inputMode="numeric"
              defaultValue={settings.cashThreshold}
              onBlur={(e) => saveSettings({ cashThreshold: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="text-sm">Bloquear venta sin stock</p>
            <p className="text-xs text-subtle">El mostrador avisa y no agrega.</p>
          </div>
          <Switch
            checked={settings.blockZeroStock}
            onCheckedChange={(v) => saveSettings({ blockZeroStock: v })}
          />
        </div>
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] lg:col-span-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Asientos</h2>
        <p className="mt-1 text-sm text-muted">Filas de la planilla de Caja.</p>
        <div className="mt-4">
          <LedgerRowsConfig />
        </div>
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] lg:col-span-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Turnos y tareas</h2>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm">Recordatorios de tareas</p>
          <Switch
            checked={settings.taskRemindersEnabled}
            onCheckedChange={(v) => saveSettings({ taskRemindersEnabled: v })}
          />
        </div>
        {settings.shifts.map((sh) => (
          <div key={sh.key} className="mt-4">
            <Label>
              {sh.name} · {sh.start}:00
            </Label>
            <textarea
              className="min-h-16 w-full rounded-md bg-elevated p-3 text-sm text-fg shadow-[var(--shadow-border)]"
              value={(settings.tasks[sh.key] ?? []).join("\n")}
              onChange={(e) =>
                saveSettings({
                  tasks: {
                    ...settings.tasks,
                    [sh.key]: e.target.value
                      .split("\n")
                      .map((l) => l.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </div>
        ))}
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] lg:col-span-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Catálogo de ejemplo</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              loadExampleCatalog();
              setWipeAsk(false);
              void subirFotocopia();
              toast.success("Catálogo de ejemplo cargado");
            }}
          >
            Cargar catálogo de ejemplo
          </Button>
          <Button
            variant={wipeAsk ? "danger" : "ghost"}
            onClick={() => {
              if (!wipeAsk) {
                setWipeAsk(true);
                return;
              }
              const r = clearExampleCatalog();
              setWipeAsk(false);
              void subirFotocopia();
              if (!r.products && !r.suppliers) {
                toast("No había catálogo de ejemplo en este local.");
                return;
              }
              toast.success(
                `Sacamos ${r.products} productos y ${r.suppliers} proveedores de ejemplo.`,
              );
            }}
          >
            {wipeAsk ? "¿Sacar el de ejemplo?" : "Sacar catálogo de ejemplo"}
          </Button>
        </div>
      </section>
    </div>
  );
}
