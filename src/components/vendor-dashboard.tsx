import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getVendorDashboard, type VendorDashboard } from "@/lib/dashboard";
import { formatDateLong } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ManualsView } from "@/components/manuals-view";
import { errorText } from "@/lib/errors";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString("es-AR", { maximumFractionDigits: 1 })} KB`;
  return `${(n / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 2 })} MB`;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p className="mt-2 font-display text-3xl tracking-tight num">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function VendorDashboardView() {
  const [data, setData] = useState<VendorDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getVendorDashboard()
      .then((d) => {
        if (live) setData(d);
      })
      .catch((err) => {
        if (live) setError(errorText(err, "No se pudo cargar el taller"));
      });
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-xl bg-surface p-5 text-sm text-danger shadow-[var(--shadow-border)]">
        {error}
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted">Cargando el taller…</p>;
  }

  const load = Math.min(100, Math.round((data.accountCount / data.comfortable) * 100));
  const path2Live = data.wooOrders > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
      <div className="ticket-grain rounded-2xl bg-paper p-6 text-ink shadow-[var(--shadow-ticket)]">
        <p className="text-[11px] uppercase tracking-[0.18em] text-ink-muted">
          Taller · {data.sellerName} · {data.hosting === "preview" ? "preview" : "publicado"}
        </p>
        <h1 className="mt-2 font-display text-3xl tracking-tight">Cómo está IMAN</h1>
        <p className="mt-3 text-sm text-ink-muted">{data.briefing}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cuentas" value={data.accountCount} hint={`${data.locals} con local`} />
        <Stat
          label="Planes activos"
          value={data.plansActive}
          hint={data.plansExpired ? `${data.plansExpired} vencidos` : "ninguno vencido"}
        />
        <Stat
          label="Códigos"
          value={data.codesIssued}
          hint={`${data.codesUnused} sin usar`}
        />
        <Stat
          label="Sesiones abiertas"
          value={data.sessions}
          hint="dueños con IMAN abierto"
        />
      </div>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-xl tracking-tight">Uso y capacidad</h2>
        <p className="mt-1 text-sm text-muted">
          Snapshot de cada local {formatBytes(data.kioskBytes)}
          {data.locals ? ` · promedio ${formatBytes(data.avgKioskBytes)}` : ""}. Cinta{" "}
          {data.eventCount.toLocaleString("es-AR")} eventos ({formatBytes(data.eventBytes)}). Si el
          snapshot crece más que la cinta, alguien volvió a mandar blobs.
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-elevated">
          <div className="h-full rounded-full bg-sage" style={{ width: `${Math.max(load, 3)}%` }} />
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <p>
            <span className="text-subtle">Hoy </span>
            <span className="num">{data.accountCount}</span>
          </p>
          <p>
            <span className="text-subtle">Neon $0 ~ </span>
            <span className="num">{data.comfortable.toLocaleString("es-AR")}</span>
          </p>
          <p>
            <span className="text-subtle">Aprieta </span>
            <span className="num">{data.ceiling.toLocaleString("es-AR")}</span>
          </p>
        </div>
        {data.hosting === "preview" ? (
          <p className="mt-3 rounded-md bg-warn/10 px-3 py-2 text-sm text-warn">
            Acá no se cobra. Publicá, reclamá, vendé el primer pack. El $0 de Neon alcanza para
            salir.
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">
            La meta es el pack cobrado, no las 10 mil. Neon $0 ~{data.comfortable} dueños. Si un
            día aprieta, se paga el plan chico.
          </p>
        )}
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <p className="text-[11px] uppercase tracking-[0.14em] text-sage">Path 2</p>
        <h2 className="mt-1 font-display text-xl tracking-tight">
          {path2Live ? "WooCommerce ya minta" : "Todavía no está implementado"}
        </h2>
        <p className="mt-2 text-sm text-muted">
          Pedidos reales: <span className="num text-fg">{data.wooOrders}</span>
          {" · "}
          mint de prueba: <span className="num text-fg">{data.wooTestOrders}</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          {path2Live
            ? "El dueño paga, IMAN fabrica el código, el mail lo lleva. El lector se despacha aparte."
            : "IMAN ya sabe mintir. Falta pegar el snippet en WooCommerce y un pedido Completado de prueba."}
        </p>
        <a href="#iman-tienda">
          <Button variant="secondary" className="mt-4">
            Snippet y clave de tienda (arriba)
          </Button>
        </a>
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-xl tracking-tight">Claves olvidadas</h2>
        <p className="mt-1 text-sm text-muted">
          Si no hay mailer (RESEND_API_KEY), copiá el enlace y mandalo por WhatsApp. Vale una hora.
        </p>
        {data.resets.length === 0 ? (
          <p className="mt-3 text-sm text-subtle">Nadie pidió recuperar todavía.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.resets.map((r) => (
              <li key={r.id} className="rounded-md bg-bg px-3 py-2 text-sm">
                <p className="truncate font-medium">{r.recipient}</p>
                <p className="text-[11px] text-subtle">
                  {r.sent ? "Mail salió" : "Pendiente de mail"} · {r.createdAt.slice(0, 16).replace("T", " ")}
                </p>
                {r.url ? (
                  <button
                    type="button"
                    className="mt-1 text-xs text-sage"
                    onClick={() => void navigator.clipboard.writeText(r.url)}
                  >
                    Copiar enlace
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-xl tracking-tight">Manuales</h2>
        <p className="mt-1 text-sm text-muted">
          Borrar Chrome sin Sincronizar es tirar el cuaderno. Una copia entera a cada venta no escala a 10 mil.
        </p>
        <div className="mt-4">
          <ManualsView />
        </div>
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-xl tracking-tight">Próximos pasos</h2>
        <ol className="mt-4 space-y-3">
          {data.steps.map((s, i) => (
            <li key={s.id} className="flex gap-3">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs num",
                  s.status === "done" && "bg-sage/20 text-sage",
                  s.status === "now" && "bg-accent text-accent-fg",
                  s.status === "later" && "bg-elevated text-subtle",
                )}
              >
                {s.status === "done" ? "ok" : i + 1}
              </span>
              <div>
                <p className={s.status === "later" ? "text-sm text-subtle" : "text-sm text-fg"}>
                  {s.title}
                  {s.status === "now" ? (
                    <span className="ml-2 text-[11px] uppercase tracking-[0.12em] text-sage">
                      ahora
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-muted">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-xl tracking-tight">Cuentas</h2>
        {data.recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Todavía no hay cuentas.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {data.recent.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm">{a.name || "Sin nombre"}</p>
                  <p className="truncate text-xs text-subtle">{a.email}</p>
                </div>
                <p className="text-xs text-muted">
                  {a.planActive ? "plan activo" : a.hasLocal ? "local, sin plan" : "alta"}
                  {a.fromWoo ? " · Path 2" : ""}
                  {a.planExpiresAt ? ` · vence ${formatDateLong(a.planExpiresAt)}` : ""}
                  {a.createdAt ? ` · ${formatDateLong(a.createdAt)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
