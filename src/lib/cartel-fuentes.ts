/**
 * Las letras de los carteles: gruesas, de licencia libre (public/fuentes/,
 * con sus licencias). Van dentro de la app para imprimir sin internet (el
 * service worker las guarda con el resto de la app) y se cargan en la página
 * recién al abrir el editor de carteles.
 */
export type Fuente = { id: string; nombre: string; familia: string; archivo: string; peso: number };

export const FUENTES: Fuente[] = [
  { id: "anton", nombre: "Anton", familia: "IMAN Anton", archivo: "/fuentes/anton.woff2", peso: 400 },
  { id: "bebas", nombre: "Bebas Neue", familia: "IMAN Bebas", archivo: "/fuentes/bebas-neue.woff2", peso: 400 },
  { id: "archivo", nombre: "Archivo Black", familia: "IMAN Archivo", archivo: "/fuentes/archivo-black.woff2", peso: 400 },
  { id: "alfa", nombre: "Alfa Slab", familia: "IMAN Alfa", archivo: "/fuentes/alfa-slab-one.woff2", peso: 400 },
  { id: "bowlby", nombre: "Bowlby", familia: "IMAN Bowlby", archivo: "/fuentes/bowlby-one.woff2", peso: 400 },
  { id: "bungee", nombre: "Bungee", familia: "IMAN Bungee", archivo: "/fuentes/bungee.woff2", peso: 400 },
  { id: "passion", nombre: "Passion", familia: "IMAN Passion", archivo: "/fuentes/passion-one.woff2", peso: 700 },
  { id: "titan", nombre: "Titan", familia: "IMAN Titan", archivo: "/fuentes/titan-one.woff2", peso: 400 },
  { id: "luckiest", nombre: "Luckiest", familia: "IMAN Luckiest", archivo: "/fuentes/luckiest-guy.woff2", peso: 400 },
  { id: "oswald", nombre: "Oswald", familia: "IMAN Oswald", archivo: "/fuentes/oswald.woff2", peso: 700 },
];

export const FUENTE_DEFAULT = "anton";

export function fuentePorId(id: string | undefined): Fuente {
  return FUENTES.find((f) => f.id === id) ?? FUENTES[0]!;
}

let cargando: Promise<void> | null = null;

/** Las diez letras en la página. Una sola vez; solo lo llama el editor de carteles. */
export function cargarFuentes(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return Promise.resolve();
  cargando ??= Promise.all(
    FUENTES.map(async (f) => {
      const face = new FontFace(f.familia, `url(${f.archivo})`, { weight: String(f.peso) });
      await face.load();
      document.fonts.add(face);
    }),
  ).then(() => undefined);
  return cargando;
}

/** La letra como data URI, para meterla dentro del SVG que se pasa a imagen. */
const enDataUri = new Map<string, Promise<string>>();
export function fuenteComoDataUri(f: Fuente): Promise<string> {
  let p = enDataUri.get(f.id);
  if (!p) {
    p = fetch(f.archivo)
      .then((r) => r.blob())
      .then(
        (b) =>
          new Promise<string>((resolve, reject) => {
            const lector = new FileReader();
            lector.onload = () => resolve(String(lector.result));
            lector.onerror = () => reject(lector.error);
            lector.readAsDataURL(b);
          }),
      );
    enDataUri.set(f.id, p);
  }
  return p;
}
