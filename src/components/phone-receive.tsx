import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ImagePlus, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { lineLabel, lineUnits, packOf } from "@/lib/pack";
import { useImanStore } from "@/lib/store";
import type { OrderDraft, OrderLine, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

type LineStatus = "ok" | "missing" | "partial";

type LineMark = {
  status: LineStatus;
  units: string;
  asPack: boolean;
};

export function PhoneReceiveView() {
  const orders = useImanStore((s) => s.orders);
  const products = useImanStore((s) => s.products);
  const receiveOrderUnits = useImanStore((s) => s.receiveOrderUnits);
  const enCamino = orders.filter(
    (o) => o.sent && !o.received && ((o.supplierName ?? "").trim() || o.lines.length > 0),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const open = enCamino.find((o) => o.id === openId) ?? null;

  if (open) {
    return (
      <ReceiveSheet
        order={open}
        products={products}
        onBack={() => setOpenId(null)}
        onConfirm={(receipts, photo) => {
          const r = receiveOrderUnits(open.id, receipts, photo);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          const sum = receipts.reduce((a, x) => a + x.units, 0);
          toast.success(sum ? `+${sum} u. en góndola` : "Anotado. No entró mercadería.");
          setOpenId(null);
        }}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div>
        <h2 className="font-display text-2xl tracking-tight">Llegó el camión</h2>
        <p className="text-xs text-subtle">Lo que está en camino. Unidades o packs.</p>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {enCamino.length === 0 ? (
          <li className="rounded-xl bg-surface px-4 py-10 text-center text-sm text-subtle shadow-[var(--shadow-border)]">
            Nada en camino. El pedido se arma en la PC. Cuando lo mandan, aparece acá.
          </li>
        ) : (
          enCamino.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setOpenId(o.id)}
                className="flex w-full items-start gap-3 rounded-xl bg-surface px-4 py-4 text-left shadow-[var(--shadow-border)]"
              >
                <Truck className="mt-0.5 size-5 shrink-0 text-sage" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{(o.supplierName ?? "").trim() || "Pedido"}</span>
                  {o.liftAt || o.deliverAt ? (
                    <span className="block text-xs text-muted">
                      {o.liftAt ? `Levanta ${formatDate(`${o.liftAt}T12:00:00`)}` : ""}
                      {o.liftAt && o.deliverAt ? " · " : ""}
                      {o.deliverAt ? `Entrega ${formatDate(`${o.deliverAt}T12:00:00`)}` : ""}
                    </span>
                  ) : null}
                  {o.lines.length ? (
                    <span className="mt-1.5 block space-y-0.5">
                      {o.lines.map((l, i) => {
                        const p = products.find((x) => x.id === l.productId);
                        return (
                          <span
                            key={`${l.productId}-${l.asUnit ? "u" : "p"}-${i}`}
                            className="flex items-baseline justify-between gap-2 text-xs text-subtle"
                          >
                            <span className="min-w-0 truncate">{l.name || p?.name || "Producto"}</span>
                            <span className="shrink-0 font-mono">{lineLabel(p, l.qty, l.asUnit)}</span>
                          </span>
                        );
                      })}
                    </span>
                  ) : (
                    <span className="text-xs text-subtle">Sin renglones</span>
                  )}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function ReceiveSheet({
  order,
  products,
  onBack,
  onConfirm,
}: {
  order: OrderDraft;
  products: Product[];
  onBack: () => void;
  onConfirm: (receipts: { productId: string; units: number }[], photo?: string) => void;
}) {
  const [marks, setMarks] = useState<Record<string, LineMark>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () =>
      order.lines.map((l, i) => {
        const p = products.find((x) => x.id === l.productId);
        const key = lineKey(l, i);
        const expected = lineUnits(p, l.qty, l.asUnit);
        const pack = packOf(p);
        return { key, line: l, product: p, expected, pack };
      }),
    [order.lines, products],
  );

  const ready =
    rows.length > 0 &&
    rows.every((row) => {
      const m = marks[row.key];
      if (!m) return false;
      if (m.status === "missing") return true;
      const u = Math.floor(Number(m.units) || 0);
      return u >= 1;
    });

  function setStatus(key: string, status: LineStatus, expected: number) {
    setMarks((cur) => ({
      ...cur,
      [key]: {
        status,
        asPack: false,
        units: status === "ok" ? String(expected) : status === "missing" ? "0" : "",
      },
    }));
  }

  function setUnits(key: string, units: string) {
    setMarks((cur) => {
      const prev = cur[key];
      if (!prev) return cur;
      return { ...cur, [key]: { ...prev, units: units.replace(/[^\d]/g, "") } };
    });
  }

  function toUnits(row: { pack: number }, m: LineMark): number {
    const n = Math.max(0, Math.floor(Number(m.units) || 0));
    if (m.status === "missing") return 0;
    return m.asPack && row.pack > 1 ? n * row.pack : n;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg"
          onClick={onBack}
          aria-label="Volver"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl leading-tight tracking-tight">{order.supplierName}</h2>
          <p className="text-xs text-subtle">Llegó / faltó / a medias. Unidades o packs.</p>
        </div>
      </div>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-1">
        {rows.map((row) => {
          const m = marks[row.key];
          return (
            <li key={row.key} className="rounded-xl bg-surface px-3 py-3 shadow-[var(--shadow-border)]">
              <p className="truncate font-medium">{row.line.name}</p>
              <p className="mt-0.5 text-xs text-subtle">
                Pedido {lineLabel(row.product, row.line.qty, row.line.asUnit)}
              </p>
              {row.pack > 1 ? (
                <p className="mt-0.5 text-xs text-muted">1 pack = {row.pack} u.</p>
              ) : null}
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["ok", "Llegó"],
                    ["missing", "Faltó"],
                    ["partial", "A medias"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStatus(row.key, id, row.expected)}
                    className={cn(
                      "h-11 rounded-md text-sm font-medium",
                      m?.status === id ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {m && m.status !== "missing" ? (
                <div className="mt-3">
                  <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
                    Cantidad que entra
                  </label>
                  {row.pack > 1 ? (
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        type="button"
                        className={cn("h-11 flex-1 rounded-md text-sm", !m.asPack ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
                        onClick={() => setMarks((cur) => ({ ...cur, [row.key]: { ...m, asPack: false } }))}
                      >
                        u.
                      </button>
                      <button
                        type="button"
                        className={cn("h-11 flex-1 rounded-md text-sm", m.asPack ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
                        onClick={() => setMarks((cur) => ({ ...cur, [row.key]: { ...m, asPack: true } }))}
                      >
                        pack
                      </button>
                    </div>
                  ) : null}
                  <Input
                    inputMode="numeric"
                    value={m.units}
                    onChange={(e) => setUnits(row.key, e.target.value)}
                    placeholder={m.status === "ok" ? String(row.expected) : "Cuántas"}
                    className="mt-1.5 h-12 text-xl font-medium"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="shrink-0 space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void readRemito(f)
              .then(setPhoto)
              .catch(() => toast.error("No se pudo leer la foto"));
          }}
        />
        {photo ? (
          <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
            <img src={photo} alt="" className="size-12 rounded-md object-cover" />
            <p className="min-w-0 flex-1 text-sm">Foto del remito</p>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-md text-muted hover:text-fg"
              onClick={() => setPhoto(null)}
              aria-label="Quitar foto"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <Button type="button" variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="size-4" />
            Foto del remito
          </Button>
        )}
        <Button
          className="w-full"
          size="lg"
          disabled={!ready || busy}
          onClick={() => {
            if (!ready) return;
            setBusy(true);
            const receipts = rows.map((row, i) => {
              const m = marks[row.key]!;
              return { productId: order.lines[i]!.productId, units: toUnits(row, m) };
            });
            onConfirm(receipts, photo ?? undefined);
            setBusy(false);
          }}
        >
          Sumar al stock
        </Button>
      </div>
    </div>
  );
}

function lineKey(l: OrderLine, i: number) {
  return `${l.productId}-${l.asUnit ? "u" : "p"}-${i}`;
}

function readRemito(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1280;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("img"));
    };
    img.src = url;
  });
}
