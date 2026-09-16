import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useImanStore } from "@/lib/store";
import { formatARS } from "@/lib/format";

export function OwnerTicket() {
  const settings = useImanStore((s) => s.settings);
  const saveSettings = useImanStore((s) => s.saveSettings);
  const mm = settings.printerMm === 58 ? 58 : 80;

  return (
    <div className="grid h-full min-h-0 gap-5 lg:grid-cols-2">
      <div className="space-y-3">
        <Label>Encabezado</Label>
        <Input
          value={settings.ticketHeader ?? ""}
          onChange={(e) => saveSettings({ ticketHeader: e.target.value })}
          placeholder="IMAN o el nombre que quieras"
        />
        <Label>Agradecimiento</Label>
        <Input
          value={settings.ticketThanks ?? ""}
          onChange={(e) => saveSettings({ ticketThanks: e.target.value })}
          placeholder="Gracias por tu compra"
        />
        <Label>Pie</Label>
        <Input
          value={settings.ticketFooter ?? ""}
          onChange={(e) => saveSettings({ ticketFooter: e.target.value })}
          placeholder="Números claros. Local que crece."
        />
        <Label>Dibujo del ticket</Label>
        <input
          type="file"
          accept="image/png,image/jpeg"
          className="block w-full text-sm text-muted file:mr-2 file:rounded-md file:border-0 file:bg-elevated file:px-3 file:py-2 file:text-fg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => saveSettings({ ticketArt: String(reader.result ?? "") });
            reader.readAsDataURL(f);
          }}
        />
        {settings.ticketArt ? (
          <Button variant="ghost" size="sm" onClick={() => saveSettings({ ticketArt: "" })}>
            Quitar dibujo
          </Button>
        ) : null}
        <Label>Ancho impresora</Label>
        <div className="flex gap-2">
          {([58, 80] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={`h-11 flex-1 rounded-full text-sm font-medium ${mm === n ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg"}`}
              onClick={() => saveSettings({ printerMm: n })}
            >
              {n} mm
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-paper p-4 font-mono text-xs text-ink shadow-[var(--shadow-ticket)]">
        {settings.ticketArt ? (
          <img src={settings.ticketArt} alt="" className="mx-auto mb-2 h-12 object-contain" />
        ) : null}
        <p className="text-center tracking-[0.2em]">{settings.ticketHeader?.trim() || "IMAN"}</p>
        <p className="mt-1 text-center font-sans text-base font-semibold">{settings.name}</p>
        <p className="text-center text-[10px] text-ink-muted">{settings.city || "Ciudad"}</p>
        <hr className="my-2 border-dashed border-ink/20" />
        <p>1 Coca-Cola 500 · {formatARS(1800)}</p>
        <p className="mt-2 text-right text-sm font-semibold">TOTAL {formatARS(1800)}</p>
        <p className="mt-3 text-center">{settings.ticketThanks?.trim() || "Gracias por tu compra"}</p>
        <p className="text-center text-[10px] text-ink-muted">
          {settings.ticketFooter?.trim() || "Números claros. Local que crece."}
        </p>
        <p className="mt-2 text-center text-[10px] text-ink-muted">{mm} mm</p>
        <Button className="mt-3 w-full" size="sm" variant="secondary" disabled>
          Vista previa
        </Button>
      </div>
    </div>
  );
}
