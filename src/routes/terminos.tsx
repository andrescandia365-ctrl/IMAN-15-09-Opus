import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terminos")({
  component: Terminos,
});

function Terminos() {
  return (
    <main className="min-h-dvh bg-bg px-4 py-10 text-fg">
      <article className="mx-auto max-w-xl">
        <p className="text-xs uppercase tracking-[0.16em] text-sage">IMAN</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">Condiciones de uso</h1>
        <p className="mt-3 text-sm text-muted">
          Esto no es un dictamen de abogado. Es el trato con el que se vende este mostrador.
        </p>

        <section className="mt-8 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            <span className="text-fg">IMAN es software comercial.</span> No es gratis, no es de
            código abierto y no se regala por crear una cuenta. El vendedor del pack (lector de
            código + período de uso) es quien figura en la tienda y en el taller del producto.
          </p>
          <p>
            La cuenta es del dueño. Cada local tiene su caja y su góndola; no se mezclan. El dueño
            que opera más de una puerta las ve bajo la misma cuenta. La cuenta no se revende ni se
            comparte como un puesto de cadena.
          </p>
          <p>
            El período (12 meses, 2 años o 3 años) empieza cuando se activa el código, no cuando se
            crea el usuario. El código es de un solo uso, va atado a una cuenta y no se adivina: si
            lo escribís mal, no entra. Cuando vence, el mostrador se cierra hasta un código nuevo.
            Los datos del kiosco quedan en la cuenta.
          </p>
          <p>
            El ticket de IMAN es el papel del mostrador: local, ciudad, hora, ítems y medio de pago.
            <span className="text-fg"> No es factura ni comprobante fiscal.</span> IMAN no emite
            facturas A, B ni C ni se conecta a ARCA. El dueño lleva la fiscalidad de su comercio
            con su contador. IMAN registra la venta del local; la factura, si corresponde, sale de
            otro lado.
          </p>
          <p>
            Quien vende IMAN puede poner su nombre, su comercio y el enlace de compra. El producto
            se ofrece a comercios de Argentina. Precios y facturación salen de esa tienda, no de
            esta pantalla.
          </p>
          <p>
            Si no estás de acuerdo, no actives un código y no uses el mostrador.
          </p>
        </section>

        <p className="mt-10 text-sm">
          <Link to="/" className="text-sage hover:underline">
            Volver
          </Link>
        </p>
      </article>
    </main>
  );
}
