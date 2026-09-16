import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ScanBarcode, KeyRound, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { getVendorPublic, type VendorPublic } from "@/lib/license";
import { savePendingTrial } from "@/lib/pending-code";

const FACTS = [
  {
    icon: ScanBarcode,
    title: "Pistola o cámara",
    body: "En la PC, la pistola. En el teléfono, la cámara. Se vende la unidad.",
  },
  {
    icon: KeyRound,
    title: "El encargado no pide PIN",
    body: "Vende y hace caja. El dueño entra con una clave de 4 a 8 números.",
  },
  {
    icon: Ticket,
    title: "El ticket no es factura",
    body: "Sale el nombre del local y la ciudad. La factura la habla el dueño con su contador.",
  },
];

export function LandingScreen() {
  const [shop, setShop] = useState<VendorPublic | null>(null);

  useEffect(() => {
    void getVendorPublic()
      .then(setShop)
      .catch(() => setShop({ claimed: false, sellerName: "IMAN", salesUrl: "" }));
  }, []);

  const salesUrl = shop?.salesUrl ?? "";

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <BrandMark />
            <span className="font-display text-lg leading-none tracking-tight">IMAN</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Entrar</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-sage">
          Argentina · kiosco, almacén, despensa
        </p>
        <h1 className="mt-4 max-w-xl font-display text-4xl leading-[1.08] tracking-tight sm:text-6xl">
          Números claros. Local que crece.
        </h1>
        <p className="mt-5 max-w-lg text-base text-muted">
          Mostrador, caja y stock. La pistola vende sin internet. El teléfono chequea la góndola.
        </p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button size="lg" variant="paper" asChild>
            <Link to="/login" search={{ alta: true }} onClick={() => savePendingTrial()}>
              Probar 19 días
            </Link>
          </Button>
          {salesUrl ? (
            <Button size="lg" variant="secondary" asChild>
              <a href={salesUrl} target="_blank" rel="noreferrer">
                Comprar el pack
              </a>
            </Button>
          ) : (
            <Button size="lg" variant="secondary" asChild>
              <Link to="/activar">Ya pagué — activar</Link>
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-subtle">Sin tarjeta para la prueba. Un local. Mail y contraseña.</p>

        <ul className="mt-16 grid gap-6 sm:grid-cols-3">
          {FACTS.map((f) => {
            const Icon = f.icon;
            return (
              <li key={f.title}>
                <Icon className="size-4 text-sage" />
                <h2 className="mt-3 font-display text-xl tracking-tight">{f.title}</h2>
                <p className="mt-2 text-sm text-muted">{f.body}</p>
              </li>
            );
          })}
        </ul>
      </main>

      <footer className="border-t border-border px-4 py-8 text-center sm:px-6">
        <p className="font-display text-lg">IMAN</p>
        <p className="mt-1 text-sm text-subtle">Números claros. Local que crece.</p>
        <p className="mt-3 text-sm">
          <Link to="/terminos" className="text-muted hover:text-fg">
            Condiciones de uso
          </Link>
        </p>
      </footer>
    </div>
  );
}
