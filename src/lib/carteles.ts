/**
 * Los carteles de promoción: plantillas, no lienzo libre. Cartel de kiosco que
 * grita: rayos de fondo, estallido detrás del título, cintas, letra gruesa
 * inclinada, rojo y amarillo. Cada plantilla tiene su versión "ahorro de
 * tinta": fondo blanco y el color solo en los detalles.
 *
 * Todo sale de un SVG con letras y formas de verdad (nítido en A4 y en media
 * hoja); la foto es lo único que es imagen. El mismo dibujo sirve para
 * imprimir y para la imagen vertical de WhatsApp. Este archivo no toca el
 * navegador: el ancho del texto lo mide quien lo llama (`medir`).
 */

export type Plantilla = "oferta" | "combo" | "2x1" | "liquidacion" | "llego" | "precio" | "aviso";

export const PLANTILLAS: { id: Plantilla; nombre: string; promo: boolean }[] = [
  { id: "oferta", nombre: "Oferta", promo: true },
  { id: "combo", nombre: "Combo", promo: true },
  { id: "2x1", nombre: "2x1", promo: true },
  { id: "liquidacion", nombre: "Liquidación", promo: true },
  { id: "llego", nombre: "Llegó nuevo", promo: false },
  { id: "precio", nombre: "Precio grande", promo: false },
  { id: "aviso", nombre: "Aviso", promo: false },
];

export type Paleta = {
  id: string;
  nombre: string;
  fondo: string;
  rayo: string;
  /** El estallido, las cintas. */
  principal: string;
  /** Texto sobre `principal`. */
  sobrePrincipal: string;
  /** El precio y los textos sobre el fondo. */
  texto: string;
  /** El contorno de las letras. */
  borde: string;
};

/** Combinaciones ya armadas: no hay selector de colores sueltos. */
export const PALETAS: Paleta[] = [
  { id: "clasico", nombre: "Amarillo y rojo", fondo: "#FFD400", rayo: "#FFE45E", principal: "#E4002B", sobrePrincipal: "#FFFFFF", texto: "#E4002B", borde: "#1A1A1A" },
  { id: "fuego", nombre: "Rojo y amarillo", fondo: "#E4002B", rayo: "#F4263F", principal: "#FFD400", sobrePrincipal: "#1A1A1A", texto: "#FFFFFF", borde: "#1A1A1A" },
  { id: "noche", nombre: "Negro y amarillo", fondo: "#151515", rayo: "#262626", principal: "#FFD400", sobrePrincipal: "#151515", texto: "#FFD400", borde: "#000000" },
  { id: "verde", nombre: "Verde y amarillo", fondo: "#00A04A", rayo: "#1DB35F", principal: "#FFD400", sobrePrincipal: "#E4002B", texto: "#FFFFFF", borde: "#0B3D20" },
];

export type CartelProducto = { nombre: string; precio: number; foto?: string | null; qty?: number };

export type CartelDatos = {
  plantilla: Plantilla;
  productos: CartelProducto[];
  /** El precio de la promo (por unidad en Oferta/Liquidación, por el conjunto en 2x1/Combo). */
  precio?: number | null;
  /** Día local YYYY-MM-DD: "Válido hasta el DD/MM". */
  hasta?: string | null;
  agotar?: boolean;
  /** Aviso. */
  titulo?: string;
  texto?: string;
};

export type Estilo = { paleta: Paleta; ahorro: boolean; familia: string };

/** Ancho del texto a `px` de alto, en las unidades del dibujo. */
export type Medir = (texto: string, px: number) => number;

export const ANCHO = 1000;
export const ALTO = 1414;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function pesos(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

export function diaMes(d: string): string {
  const [, m, dd] = d.split("-");
  return `${dd}/${m}`;
}

/**
 * El tamaño más grande al que entra el texto en `maxLineas` renglones de
 * `ancho`, cortando por palabras. Si ni al mínimo entra, corta con "…".
 */
export function ajustar(
  texto: string,
  ancho: number,
  maxLineas: number,
  tamMax: number,
  tamMin: number,
  medir: Medir,
): { lineas: string[]; tam: number } {
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  if (!palabras.length) return { lineas: [], tam: tamMax };
  const partir = (tam: number): string[] | null => {
    const lineas: string[] = [];
    let cur = "";
    for (const w of palabras) {
      if (medir(w, tam) > ancho) return null;
      const prueba = cur ? `${cur} ${w}` : w;
      if (medir(prueba, tam) <= ancho) cur = prueba;
      else {
        lineas.push(cur);
        cur = w;
      }
    }
    if (cur) lineas.push(cur);
    return lineas.length <= maxLineas ? lineas : null;
  };
  for (let tam = tamMax; tam >= tamMin; tam = Math.floor(tam * 0.94)) {
    const l = partir(tam);
    if (l) return { lineas: l, tam };
  }
  let corto = texto.trim();
  while (corto.length > 1 && medir(`${corto}…`, tamMin) > ancho) corto = corto.slice(0, -1);
  return { lineas: [corto.length < texto.trim().length ? `${corto}…` : corto], tam: tamMin };
}

/** Texto grueso, inclinado, con contorno (en ahorro de tinta, sin contorno). */
function letras(
  lineas: string[],
  tam: number,
  cx: number,
  cy: number,
  relleno: string,
  e: Estilo,
  opts: { inclinado?: boolean; contorno?: number; interlinea?: number } = {},
): string {
  const inter = (opts.interlinea ?? 0.95) * tam;
  const alto = inter * (lineas.length - 1);
  // Siempre con espacios alrededor: pegado a otro atributo, el SVG no es XML
  // válido y la imagen para compartir no se arma (en la página sí se ve).
  const skew = opts.inclinado === false ? " " : ` transform="skewX(-9)" `;
  const borde = e.ahorro ? "" : ` stroke="${e.paleta.borde}" stroke-width="${opts.contorno ?? Math.max(4, tam * 0.07)}" paint-order="stroke" stroke-linejoin="round"`;
  return lineas
    .map((l, i) => {
      const y = cy - alto / 2 + i * inter;
      // skewX corre la letra a la derecha según la altura: se compensa en x.
      const x = opts.inclinado === false ? cx : cx + y * Math.tan((9 * Math.PI) / 180);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}"${skew}text-anchor="middle" dominant-baseline="central" font-family="'${e.familia}'" font-size="${tam}" fill="${relleno}"${borde}>${esc(l)}</text>`;
    })
    .join("");
}

function rayos(cx: number, cy: number, r: number, n: number, color: string): string {
  let d = "";
  for (let i = 0; i < n; i += 2) {
    const a1 = (i / n) * Math.PI * 2;
    const a2 = ((i + 1) / n) * Math.PI * 2;
    d += `M${cx},${cy} L${(cx + r * Math.cos(a1)).toFixed(1)},${(cy + r * Math.sin(a1)).toFixed(1)} L${(cx + r * Math.cos(a2)).toFixed(1)},${(cy + r * Math.sin(a2)).toFixed(1)} Z `;
  }
  return `<path d="${d}" fill="${color}"/>`;
}

/** Estallido: estrella de muchas puntas, más ancha que alta. */
function estallido(cx: number, cy: number, rx: number, ry: number, puntas: number, fill: string, stroke: string, sw: number): string {
  const pts: string[] = [];
  for (let i = 0; i < puntas * 2; i++) {
    const a = (i / (puntas * 2)) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 === 0 ? 1 : 0.8;
    pts.push(`${(cx + rx * k * Math.cos(a)).toFixed(1)},${(cy + ry * k * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

/** Cinta con las puntas cortadas en V. */
function cinta(x: number, y: number, w: number, h: number, fill: string, stroke: string, sw: number): string {
  const v = h * 0.35;
  return `<polygon points="${x - v},${y} ${x + w + v},${y} ${x + w},${y + h / 2} ${x + w + v},${y + h} ${x - v},${y + h} ${x},${y + h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

function foto(href: string, x: number, y: number, lado: number, id: string, e: Estilo): string {
  const r = lado * 0.08;
  const marco = e.ahorro ? e.paleta.principal : "#FFFFFF";
  return (
    `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="${r}"/></clipPath>` +
    `<rect x="${x - 10}" y="${y - 10}" width="${lado + 20}" height="${lado + 20}" rx="${r + 8}" fill="${marco}" stroke="${e.paleta.borde}" stroke-width="${e.ahorro ? 0 : 4}"/>` +
    `<image href="${href}" x="${x}" y="${y}" width="${lado}" height="${lado}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
  );
}

const TITULO: Record<Plantilla, string> = {
  oferta: "OFERTA",
  combo: "COMBO",
  "2x1": "2x1",
  liquidacion: "LIQUIDACIÓN",
  llego: "¡LLEGÓ!",
  precio: "",
  aviso: "",
};

const CINTA: Partial<Record<Plantilla, string>> = {
  "2x1": "LLEVÁ 2, PAGÁ 1",
  llego: "NUEVO",
  liquidacion: "ÚLTIMAS UNIDADES",
};

/** El cartel, 1000 × 1414 (A4 y media hoja tienen la misma proporción). Sin <svg> de afuera. */
export function cartelCuerpo(d: CartelDatos, e: Estilo, medir: Medir, idPre = "c"): string {
  const P = e.paleta;
  const fondo = e.ahorro ? "#FFFFFF" : P.fondo;
  const tinta = e.ahorro ? "#1A1A1A" : P.texto;
  const destaque = e.ahorro ? P.principal : P.texto;
  const out: string[] = [];
  out.push(`<rect width="${ANCHO}" height="${ALTO}" fill="${fondo}"/>`);
  if (!e.ahorro) out.push(rayos(ANCHO / 2, 330, 1500, 36, P.rayo));
  else out.push(`<rect x="18" y="18" width="${ANCHO - 36}" height="${ALTO - 36}" rx="28" fill="none" stroke="${P.principal}" stroke-width="10"/>`);

  const prod = d.productos[0];
  const titulo =
    d.plantilla === "aviso" ? (d.titulo || "AVISO").toUpperCase() : d.plantilla === "precio" ? (prod?.nombre ?? "").toUpperCase() : TITULO[d.plantilla];

  // [A] Estallido con el título.
  const estFill = e.ahorro ? "#FFFFFF" : P.principal;
  out.push(estallido(ANCHO / 2, 225, 470, 185, 22, estFill, e.ahorro ? P.principal : P.borde, e.ahorro ? 8 : 6));
  const t = ajustar(titulo, 700, d.plantilla === "precio" || d.plantilla === "aviso" ? 2 : 1, 210, 60, medir);
  out.push(letras(t.lineas, t.tam, ANCHO / 2, 225, e.ahorro ? P.principal : P.sobrePrincipal, e));

  if (d.plantilla === "aviso") {
    const cuerpo = ajustar(d.texto || "", 820, 7, 150, 44, medir);
    out.push(letras(cuerpo.lineas, cuerpo.tam, ANCHO / 2, 850, tinta, e, { inclinado: false, interlinea: 1.1 }));
    return out.join("");
  }

  // [B] Cinta.
  const textoCinta =
    CINTA[d.plantilla] ??
    (d.plantilla === "combo"
      ? d.productos.map((p) => `${p.qty && p.qty > 1 ? `${p.qty} ` : ""}${p.nombre}`).join(" + ")
      : d.plantilla === "precio"
        ? "PRECIO"
        : (prod?.nombre ?? ""));
  const tc = ajustar(textoCinta.toUpperCase(), 720, 1, 70, 30, medir);
  out.push(cinta(140, 440, 720, 105, e.ahorro ? "#FFFFFF" : P.principal, e.ahorro ? P.principal : P.borde, e.ahorro ? 6 : 5));
  out.push(letras(tc.lineas, tc.tam, ANCHO / 2, 492, e.ahorro ? P.principal : P.sobrePrincipal, e, { contorno: 0, inclinado: false }));

  // [C] Foto, o el nombre grande si no hay. Arriba: foto 585–925; abajo, antes y precio.
  const conFoto = d.productos.filter((p) => p.foto);
  const nombreDebajo = d.plantilla !== "precio" && d.plantilla !== "combo" && Boolean(CINTA[d.plantilla]);
  const hayFoto = d.plantilla === "combo" ? conFoto.length > 0 : Boolean(prod?.foto);
  if (d.plantilla === "combo" && hayFoto) {
    const n = Math.min(4, d.productos.length);
    const lado = n <= 2 ? 300 : 190;
    const gap = n <= 2 ? 90 : 40;
    const total = n * lado + (n - 1) * gap;
    let x = (ANCHO - total) / 2;
    const y0 = n <= 2 ? 600 : 650;
    d.productos.slice(0, 4).forEach((p, i) => {
      if (p.foto) out.push(foto(p.foto, x, y0, lado, `${idPre}f${i}`, e));
      else {
        const nm = ajustar(p.nombre, lado - 24, 3, 58, 22, medir);
        out.push(`<rect x="${x}" y="${y0}" width="${lado}" height="${lado}" rx="${lado * 0.08}" fill="#FFFFFF" stroke="${P.borde}" stroke-width="4"/>`);
        out.push(letras(nm.lineas, nm.tam, x + lado / 2, y0 + lado / 2, "#1A1A1A", e, { inclinado: false, contorno: 0 }));
      }
      if (i < n - 1) out.push(letras(["+"], 90, x + lado + gap / 2, y0 + lado / 2, destaque, e, { inclinado: false }));
      x += lado + gap;
    });
  } else if (hayFoto && prod?.foto) {
    out.push(foto(prod.foto, 330, 585, 340, `${idPre}f0`, e));
    if (nombreDebajo) {
      const nm = ajustar(prod.nombre.toUpperCase(), 820, 1, 50, 26, medir);
      out.push(letras(nm.lineas, nm.tam, ANCHO / 2, 962, tinta, e, { inclinado: false, contorno: e.ahorro ? 0 : 4 }));
    }
  } else if (d.plantilla !== "precio" && d.plantilla !== "combo" && prod) {
    // Sin foto el nombre ocupa el lugar de la foto: la plantilla se ve igual de llena.
    const nm = ajustar(prod.nombre.toUpperCase(), 840, 3, 140, 50, medir);
    out.push(letras(nm.lineas, nm.tam, ANCHO / 2, 770, tinta, e));
  }

  // [D] El precio, con "antes" arriba si la promo abarata.
  const esPromo = d.plantilla === "oferta" || d.plantilla === "liquidacion" || d.plantilla === "2x1" || d.plantilla === "combo";
  const precio = esPromo ? (d.precio ?? null) : (prod?.precio ?? null);
  if (precio != null) {
    const sufijo = d.plantilla === "2x1" ? "LOS 2" : d.plantilla === "combo" ? "EL COMBO" : "";
    const antes =
      d.plantilla === "oferta" || d.plantilla === "liquidacion"
        ? prod?.precio
        : d.plantilla === "2x1"
          ? (prod?.precio ?? 0) * 2
          : d.plantilla === "combo"
            ? d.productos.reduce((a, p) => a + p.precio * (p.qty ?? 1), 0)
            : null;
    const grande = d.plantilla === "precio";
    const yPrecio = grande ? (hayFoto ? 1110 : 900) : 1170;
    const tamMax = grande ? (hayFoto ? 300 : 380) : 220;
    const k = 0.3;
    const texto = pesos(precio);
    // El sufijo va pegado al precio, más chico, en el mismo renglón.
    const medirJunto = (t: string, px: number) => medir(t, px) + (sufijo ? medir(` ${sufijo}`, px * k) : 0);
    const tp = ajustar(texto, 880, 1, tamMax, 90, medirJunto);
    const tam = tp.tam;
    const anchoTotal = medirJunto(texto, tam);
    const x0 = ANCHO / 2 - anchoTotal / 2;
    const borde = e.ahorro ? "" : ` stroke="${P.borde}" stroke-width="${Math.max(4, tam * 0.06)}" paint-order="stroke" stroke-linejoin="round"`;
    const dx = yPrecio * Math.tan((9 * Math.PI) / 180);
    out.push(
      `<text x="${(x0 + dx).toFixed(1)}" y="${yPrecio}" transform="skewX(-9)" dominant-baseline="central" font-family="'${e.familia}'" font-size="${tam}" fill="${destaque}"${borde}>${esc(texto)}${
        sufijo ? `<tspan font-size="${(tam * k).toFixed(1)}" dx="${(tam * 0.06).toFixed(1)}" fill="${tinta}">${esc(sufijo)}</tspan>` : ""
      }</text>`,
    );
    if (antes && antes > precio) {
      const ta = `ANTES ${pesos(antes)}`;
      const tamA = 46;
      const w = medir(ta, tamA);
      const y = yPrecio - tam * 0.5 - 30;
      const colorA = e.ahorro ? "#1A1A1A" : P.borde;
      out.push(`<rect x="${(ANCHO - w) / 2 - 22}" y="${y - 32}" width="${w + 44}" height="64" rx="32" fill="#FFFFFF" opacity="0.92"/>`);
      out.push(letras([ta], tamA, ANCHO / 2, y, colorA, e, { inclinado: false, contorno: 0 }));
      out.push(`<line x1="${(ANCHO - w) / 2 - 4}" y1="${y}" x2="${(ANCHO + w) / 2 + 4}" y2="${y}" stroke="${P.principal === "#FFD400" && !e.ahorro ? "#E4002B" : P.principal}" stroke-width="6" stroke-linecap="round"/>`);
    }
  }

  // [E] Validez.
  if (esPromo && d.hasta) {
    const val = `VÁLIDO HASTA EL ${diaMes(d.hasta)}${d.agotar ? " · HASTA AGOTAR STOCK" : ""}`;
    const tv = ajustar(val, 820, 1, 48, 24, medir);
    out.push(`<rect x="70" y="1318" width="${ANCHO - 140}" height="70" rx="35" fill="${e.ahorro ? "#FFFFFF" : P.borde}" stroke="${e.ahorro ? P.principal : "none"}" stroke-width="5"/>`);
    out.push(letras(tv.lineas, tv.tam, ANCHO / 2, 1353, e.ahorro ? P.principal : "#FFFFFF", e, { inclinado: false, contorno: 0 }));
  }
  return out.join("");
}

function estiloFuente(css: string | undefined): string {
  return css ? `<style>${css}</style>` : "";
}

/** El cartel suelto, para la vista previa y para imprimir. `ancho`/`alto`: el tamaño del <svg> (mm, px). */
export function cartelSvg(d: CartelDatos, e: Estilo, medir: Medir, t: { ancho: string; alto: string; css?: string; idPre?: string }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${ALTO}" width="${t.ancho}" height="${t.alto}">${estiloFuente(t.css)}${cartelCuerpo(d, e, medir, t.idPre)}</svg>`;
}

export const HISTORIA = { ancho: 1080, alto: 1920 };

/** La imagen vertical para el estado de WhatsApp y las historias: el cartel con el nombre del kiosco (y su ciudad abajo). */
export function historiaSvg(d: CartelDatos, e: Estilo, medir: Medir, local: string, css?: string, ciudad = ""): string {
  const P = e.paleta;
  const fondo = e.ahorro ? "#FFFFFF" : P.fondo;
  const k = (HISTORIA.ancho - 60) / ANCHO;
  const alto = ALTO * k;
  const y = 250;
  const tl = ajustar(local.toUpperCase(), 960, 1, 110, 40, medir);
  const banda = e.ahorro ? P.principal : P.borde;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HISTORIA.ancho} ${HISTORIA.alto}" width="${HISTORIA.ancho}" height="${HISTORIA.alto}">` +
    estiloFuente(css) +
    `<rect width="${HISTORIA.ancho}" height="${HISTORIA.alto}" fill="${fondo}"/>` +
    `<rect width="${HISTORIA.ancho}" height="210" fill="${banda}"/>` +
    letras(tl.lineas, tl.tam, HISTORIA.ancho / 2, 105, "#FFFFFF", { ...e, ahorro: true }, { inclinado: false }) +
    // Los rayos pasan de largo el recuadro del cartel: se recorta para que no tapen el nombre.
    `<clipPath id="h-recorte"><rect width="${ANCHO}" height="${ALTO}"/></clipPath>` +
    `<g transform="translate(30 ${y}) scale(${k.toFixed(4)})"><g clip-path="url(#h-recorte)">${cartelCuerpo(d, e, medir, "h")}</g></g>` +
    `<rect y="${y + alto + 30}" width="${HISTORIA.ancho}" height="${HISTORIA.alto - y - alto - 30}" fill="${banda}"/>` +
    (ciudad.trim()
      ? letras([ciudad.trim().toUpperCase()], 44, HISTORIA.ancho / 2, (y + alto + 30 + HISTORIA.alto) / 2, "#FFFFFF", { ...e, ahorro: true }, { inclinado: false })
      : "") +
    `</svg>`
  );
}
