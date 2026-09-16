import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatARS, startOfDay } from "@/lib/format";
import { useImanStore } from "@/lib/store";

const PAY_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  mercadopago: "Mercado Pago",
  debito: "Débito",
};

export function ReportsView() {
  const sales = useImanStore((s) => s.sales);
  const products = useImanStore((s) => s.products);

  const data = useMemo(() => {
    const start = startOfDay();
    const today = sales.filter((s) => new Date(s.createdAt) >= start);
    const total = today.reduce((a, s) => a + s.total, 0);
    const tickets = today.length;
    const ticketAvg = tickets ? total / tickets : 0;
    const mix = (["efectivo", "mercadopago", "debito"] as const).map((k) => ({
      name: PAY_LABEL[k],
      value: today.filter((s) => s.paymentMethod === k).reduce((a, s) => a + s.total, 0),
    }));
    const hours = Array.from({ length: 18 }, (_, i) => {
      const h = i + 6;
      const slice = today.filter((s) => new Date(s.createdAt).getHours() === h);
      return {
        h: `${String(h).padStart(2, "0")}h`,
        total: slice.reduce((a, s) => a + s.total, 0),
      };
    });
    const byProduct = new Map<string, { name: string; qty: number; total: number; cost: number }>();
    for (const s of today) {
      for (const it of s.items) {
        const p = products.find((x) => x.id === it.productId);
        const cur = byProduct.get(it.productId) ?? {
          name: it.name,
          qty: 0,
          total: 0,
          cost: 0,
        };
        cur.qty += it.qty;
        cur.total += it.price * it.qty;
        cur.cost += (p?.cost ?? it.price * 0.7) * it.qty;
        byProduct.set(it.productId, cur);
      }
    }
    const top = [...byProduct.values()].sort((a, b) => b.total - a.total).slice(0, 6);
    const margin = top.reduce((a, x) => a + (x.total - x.cost), 0);
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() - 6);
    const week = sales.filter((s) => new Date(s.createdAt) >= weekStart);
    const weekTotal = week.reduce((a, s) => a + s.total, 0);
    return { today, total, tickets, ticketAvg, mix, hours, top, margin, weekTotal };
  }, [sales, products]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Hoy" value={formatARS(data.total)} />
        <Kpi label="Tickets" value={String(data.tickets)} />
        <Kpi label="Ticket promedio" value={formatARS(data.ticketAvg)} />
        <Kpi label="Margen estimado" value={formatARS(data.margin)} />
      </div>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
          Ventas por hora
        </h2>
        <div className="mt-3 h-48 text-accent">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.hours}>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
              <XAxis dataKey="h" tick={{ fill: "var(--iman-subtle)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <RTooltip
                cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
                contentStyle={{
                  background: "var(--iman-elevated)",
                  border: "1px solid color-mix(in oklab, var(--iman-fg) 12%, transparent)",
                  borderRadius: 8,
                  color: "var(--iman-fg)",
                  fontSize: 12,
                }}
                formatter={(v) => formatARS(Number(v ?? 0))}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="currentColor" maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Medios</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {data.mix.map((m) => {
              const pct = data.total ? (m.value / data.total) * 100 : 0;
              return (
                <li key={m.name}>
                  <div className="flex justify-between text-sm">
                    <span>{m.name}</span>
                    <span className="num text-sage">{formatARS(m.value)}</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-elevated">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
            Más vendidos hoy
          </h2>
          {data.top.length === 0 ? (
            <p className="mt-4 text-sm text-subtle">Todavía no hay ventas hoy. Probá el mostrador.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {data.top.map((p, i) => (
                <li key={p.name} className="flex items-center gap-3">
                  <span className="num w-5 text-xs text-subtle">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <span className="text-xs text-subtle">{p.qty} u.</span>
                  <span className="num text-sm text-sage">{formatARS(p.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="text-xs text-subtle">Semana (7 días): {formatARS(data.weekTotal)}</p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
      <div className="text-[11px] uppercase tracking-[0.08em] text-subtle">{label}</div>
      <div className="num mt-1 text-2xl font-medium tracking-tight">{value}</div>
    </div>
  );
}

