/**
 * Genera el pack de marca de IMAN: los SVG de `brand/`, los íconos de la app
 * en `public/`, la foto de perfil y la imagen para compartir links.
 *
 * La geometría del símbolo vive acá y en ningún otro lado (salvo `ImanMark`,
 * en `src/components/brand-mark.tsx`). Son los trazos tal cual los definió
 * Andres, en un viewBox de 110 × 110.
 *
 * No hay ImageMagick ni rsvg en el proyecto: se rasteriza con el Chromium que
 * ya viene con Playwright. El .ico se arma a mano (PNG adentro del contenedor
 * ICO, que es lo que entienden Windows y los navegadores de hoy).
 *
 *   node scripts/brand-icons.mjs
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { PALABRA } from "./brand-palabra.mjs";

const TINTA = "#14130f";
const CREMA = "#ebe4d4";
const VERDE = "#8eae8a";
const VERDE_OSC = "#3f6b48";
const PAPEL = "#fffaf0";

/** Margen libre alrededor del símbolo: la mitad de la altura del bloque de barras. */
const X_LIBRE = 12;

// ── Geometría ──────────────────────────────────────────────────────────────

/** Líneas de campo de la completa: [d, grosor, ¿exterior?]. */
const CAMPO_COMPLETA = [
  ["M 34,44 C 26,20 84,20 76,44", 5, false],
  ["M 34,68 C 26,92 84,92 76,68", 5, false],
  ["M 32,42 C 18,4 92,4 78,42", 3.5, true],
  ["M 32,70 C 18,106 92,106 78,70", 3.5, true],
];
/** Barras de la completa: [x, ancho]. Las cuatro primeras son el polo verde. */
const BARRAS_COMPLETA = [[34, 4], [40, 2], [44, 5], [51, 2], [57, 2], [61, 5], [68, 2], [72, 4]];

const CAMPO_SIMPLE = [
  ["M 34,44 C 26,18 84,18 76,44", 8],
  ["M 34,68 C 26,94 84,94 76,68", 8],
];
const BARRAS_SIMPLE = [[34, 8], [46, 6], [58, 6], [68, 8]];

/**
 * El símbolo completo. `medioTono: false` es para la versión de un color: la
 * impresión a una tinta no tiene opacidades.
 */
function completa({ campo, izq, der, medioTono = true }) {
  const lineas = CAMPO_COMPLETA.map(([d, w, exterior]) => {
    const op = exterior && medioTono ? ` opacity="0.6"` : "";
    return `<path d="${d}" stroke="${campo}" stroke-width="${w}" fill="none" stroke-linecap="round"${op}/>`;
  });
  const barras = BARRAS_COMPLETA.map(
    ([x, w], i) => `<rect x="${x}" y="44" width="${w}" height="24" rx="1" fill="${i < 4 ? izq : der}"/>`,
  );
  return [...lineas, ...barras];
}

function simplificada({ campo, izq, der }) {
  const lineas = CAMPO_SIMPLE.map(
    ([d, w]) => `<path d="${d}" stroke="${campo}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`,
  );
  const barras = BARRAS_SIMPLE.map(
    ([x, w], i) => `<rect x="${x}" y="44" width="${w}" height="24" rx="1" fill="${i < 2 ? izq : der}"/>`,
  );
  return [...lineas, ...barras];
}

const COMPLETA = { campo: VERDE, izq: VERDE, der: CREMA };
const NEGATIVO = { campo: VERDE_OSC, izq: VERDE_OSC, der: TINTA };
const unColor = (c) => ({ campo: c, izq: c, der: c, medioTono: false });

/** Caja de tinta del símbolo completo: las curvas con su grosor y las barras. */
function cajaCompleta() {
  let x0 = 34, x1 = 76, y0 = 44, y1 = 68;
  for (const [d, w] of CAMPO_COMPLETA) {
    const [p0, p1, p2, p3] = d.match(/-?\d+(\.\d+)?/g).map(Number).reduce((acc, n, i) => {
      if (i % 2 === 0) acc.push([n]);
      else acc[acc.length - 1].push(n);
      return acc;
    }, []);
    // Con punta redonda, la caja de la curva más medio grosor es exacta.
    for (let i = 0; i <= 2000; i++) {
      const t = i / 2000, u = 1 - t;
      const x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0];
      const y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1];
      x0 = Math.min(x0, x - w / 2); x1 = Math.max(x1, x + w / 2);
      y0 = Math.min(y0, y - w / 2); y1 = Math.max(y1, y + w / 2);
    }
  }
  return { x0, x1, y0, y1 };
}

// ── Documentos SVG ─────────────────────────────────────────────────────────

const r2 = (n) => Math.round(n * 100) / 100;

function doc({ w, h, fondo, rx = 0, nota, cuerpo }) {
  const bg = fondo ? `  <rect width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ""} fill="${fondo}"/>\n` : "";
  const comentario = nota ? `  <!-- ${nota} -->\n` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n` +
    comentario +
    bg +
    cuerpo.map((l) => `  ${l}`).join("\n") +
    `\n</svg>\n`
  );
}

/** El símbolo de 110 escalado `k` veces alrededor del centro de la caja. */
function escalado(lineas, k) {
  if (k === 1) return lineas;
  return [`<g transform="translate(55 55) scale(${k}) translate(-55 -55)">`, ...lineas.map((l) => `  ${l}`), `</g>`];
}

/**
 * Conjunto horizontal. Con la letra en 100 unidades: la caja del símbolo mide
 * 140 (1,4 × la letra) y entre símbolo y palabra hay 35 (0,35 × la letra),
 * medido de lo visible a lo visible: del borde del dibujo al remate de la I.
 * Medido desde el borde de la caja quedaba el doble, porque la caja de 110 ya
 * trae aire adentro. Las mayúsculas quedan centradas en la altura del bloque
 * de barras. Alrededor, el margen libre X.
 */
function conjunto({ simbolo, letra, fondo, nota }) {
  const caja = 140;
  const s = caja / 110;
  const sim = cajaCompleta();
  const xPalabra = r2(sim.x1 * s + 35 - PALABRA.tinta.x0);
  const base = 56 * s + PALABRA.alturaMayusculas / 2;
  const x = X_LIBRE * s;
  const izq = sim.x0 * s - x;
  const arriba = Math.min(sim.y0 * s, base - PALABRA.alturaMayusculas) - x;
  const abajo = Math.max(sim.y1 * s, base) + x;
  const der = xPalabra + PALABRA.tinta.x1 + x;
  const w = r2(der - izq);
  const h = r2(abajo - arriba);
  const cuerpo = [
    `<g transform="translate(${r2(-izq)} ${r2(-arriba)})">`,
    `  <g transform="scale(${r2(s * 1e4) / 1e4})">`,
    ...simbolo.map((l) => `    ${l}`),
    `  </g>`,
    `  <path transform="translate(${xPalabra} ${r2(base)})" fill="${letra}" d="${PALABRA.d}"/>`,
    `</g>`,
  ];
  return { svg: doc({ w, h, fondo, nota, cuerpo }), w, h };
}

// ── Rasterizado ────────────────────────────────────────────────────────────

const b = await chromium.launch();
const ctx = await b.newContext({ deviceScaleFactor: 1 });

/** PNG de `w × h` a partir de un SVG, con transparencia donde el SVG no pinta. */
async function png(svg, w, h = w, tipo = "png") {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: w, height: h });
  const sized = svg.replace(/ width="[\d.]+" height="[\d.]+">/, ` width="${w}" height="${h}">`);
  await p.setContent(`<body style="margin:0;background:transparent">${sized}</body>`);
  const buf = await p
    .locator("svg")
    .screenshot(tipo === "jpeg" ? { type: "jpeg", quality: 92 } : { omitBackground: true });
  await p.close();
  return buf;
}

/**
 * Mide sobre el PNG ya rasterizado hasta dónde llega el dibujo: el píxel que
 * se aparta del fondo más lejos del centro, en fracción del lado.
 */
async function radioDelDibujo(buf, fondo) {
  const p = await ctx.newPage();
  const res = await p.evaluate(
    async ({ b64, fondo }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const { data } = g.getImageData(0, 0, c.width, c.height);
      const f = [1, 3, 5].map((i) => parseInt(fondo.slice(i, i + 2), 16));
      const cx = c.width / 2, cy = c.height / 2;
      let max = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          const dif = Math.abs(data[i] - f[0]) + Math.abs(data[i + 1] - f[1]) + Math.abs(data[i + 2] - f[2]);
          if (dif > 6) max = Math.max(max, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
        }
      }
      return { max, lado: c.width };
    },
    { b64: buf.toString("base64"), fondo },
  );
  await p.close();
  return res;
}

/** ICO con PNG adentro: es lo que entienden Windows y los navegadores de hoy. */
function ico(pngs) {
  const n = pngs.length;
  const head = Buffer.alloc(6 + 16 * n);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(n, 4);
  let off = 6 + 16 * n;
  pngs.forEach(({ size, buf }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((x) => x.buf)]);
}

function escribir(ruta, contenido, detalle = "") {
  writeFileSync(ruta, contenido);
  console.log(`  ${ruta}${detalle ? `  ${detalle}` : ""}`);
}

// ── brand/: las cinco versiones ────────────────────────────────────────────

const V = { w: 110, h: 110 };
const simboloCompleto = doc({
  ...V, fondo: TINTA, cuerpo: completa(COMPLETA),
  nota: "IMAN — símbolo COMPLETO, sobre tinta. De 64 px para arriba.",
});
const simboloSimple = doc({
  ...V, fondo: TINTA, cuerpo: simplificada(COMPLETA),
  nota: "IMAN — símbolo SIMPLIFICADO, sobre tinta. De 48 px para abajo: favicon y miniaturas.",
});
escribir("brand/simbolo-completo.svg", simboloCompleto);
escribir("brand/simbolo-simplificado.svg", simboloSimple);
escribir("brand/simbolo-negativo.svg", doc({
  ...V, fondo: PAPEL, cuerpo: completa(NEGATIVO),
  nota: "IMAN — símbolo NEGATIVO, para fondos claros.",
}));
escribir("brand/simbolo-un-color-tinta-sobre-papel.svg", doc({
  ...V, fondo: PAPEL, cuerpo: completa(unColor(TINTA)),
  nota: "IMAN — símbolo a UN COLOR, tinta sobre papel. Sin opacidades.",
}));
escribir("brand/simbolo-un-color-papel-sobre-tinta.svg", doc({
  ...V, fondo: TINTA, cuerpo: completa(unColor(PAPEL)),
  nota: "IMAN — símbolo a UN COLOR, papel sobre tinta. Sin opacidades.",
}));

const conjuntoOscuro = conjunto({
  simbolo: completa(COMPLETA), letra: CREMA, fondo: TINTA,
  nota: "IMAN — conjunto horizontal, versión oscura. La palabra va en trazos (Fraunces 500).",
});
escribir("brand/conjunto-oscuro.svg", conjuntoOscuro.svg, `${conjuntoOscuro.w} × ${conjuntoOscuro.h}`);
escribir("brand/conjunto-claro.svg", conjunto({
  simbolo: completa(NEGATIVO), letra: TINTA, fondo: PAPEL,
  nota: "IMAN — conjunto horizontal, versión clara. La palabra va en trazos (Fraunces 500).",
}).svg);

// ── public/: la app ────────────────────────────────────────────────────────

// Favicon: la simplificada. El .svg es el mismo archivo que el de brand/.
escribir("public/favicon.svg", simboloSimple, "(simplificada)");
const chicos = [];
for (const size of [16, 32, 48]) chicos.push({ size, buf: await png(simboloSimple, size) });
escribir("public/favicon.ico", ico(chicos), "16 + 32 + 48 (simplificada)");

// PWA: la completa en un cuadrado de esquinas redondeadas. Afuera, transparente.
// El de 1024 es para que Android nunca tenga que agrandar: con 512 la pantalla
// de arranque se veía pixelada en celus de densidad alta.
const redondeado = doc({ ...V, fondo: TINTA, rx: 24, cuerpo: completa(COMPLETA) });
for (const size of [192, 512, 1024]) escribir(`public/icon-${size}.png`, await png(redondeado, size), `${size} (completa, redondeada)`);

// iOS no admite transparencia en el apple-touch-icon: fondo sólido, iOS redondea solo.
const apple = await png(simboloCompleto, 180);
escribir("public/apple-touch-icon.png", apple, "180 (completa, fondo sólido)");
// El plugin de la plataforma inyecta SIEMPRE un segundo <link apple-touch-icon>
// apuntando acá (busca su propia URL, no si ya hay uno). En iOS puede ganar el
// último, así que este archivo también lleva el símbolo de IMAN: gane el tag
// que gane, el kiosquero ve el mismo ícono.
escribir("public/__grok/icon-180.png", apple, "180 (el mismo)");

// Maskable: Android arma con esto el ícono adaptable, que recorta con la forma
// del lanzador y, en la pantalla de arranque, con un círculo. La zona que
// ninguna máscara recorta es la de la especificación de Android: los 66 dp del
// centro de un lienzo de 108 dp (radio 33/108 del lado). Es más estricta que
// el 80% de la especificación web de maskable, que es la que se usaba y
// dejaba el símbolo en el borde. Se mide sobre el PNG: si el símbolo no entra,
// se achica (nunca se recorta).
const ZONA_ANDROID = 33 / 108;
let k = 1;
for (;;) {
  const maskable = doc({ ...V, fondo: TINTA, cuerpo: escalado(completa(COMPLETA), k) });
  const buf1024 = await png(maskable, 1024);
  const { max, lado } = await radioDelDibujo(buf1024, TINTA);
  const zona = ZONA_ANDROID * lado;
  if (max <= zona) {
    escribir("public/icon-maskable-1024.png", buf1024,
      `símbolo al ${Math.round(k * 100)}%: llega a ${max.toFixed(1)} px del centro, la zona segura es ${zona.toFixed(1)} px (sobran ${(zona - max).toFixed(1)})`);
    escribir("public/icon-maskable-512.png", await png(maskable, 512), "512 (la misma)");
    escribir("public/icon-maskable-192.png", await png(maskable, 192), "192 (la misma)");
    break;
  }
  console.log(`  maskable al ${Math.round(k * 100)}%: llega a ${max.toFixed(1)} px, la zona es ${zona.toFixed(1)}. Se achica.`);
  k = r2(k - 0.02);
}

// ── Redes y afiliados ─────────────────────────────────────────────────────

// Foto de perfil: se muestra recortada en círculo. El símbolo al centro y con
// aire, así que la caja de 110 ocupa 760 de los 1080.
const lienzo = 1080;
const cajaPerfil = 760;
const offPerfil = (lienzo - cajaPerfil) / 2;
const perfil = doc({
  w: lienzo, h: lienzo, fondo: TINTA,
  cuerpo: [`<g transform="translate(${offPerfil} ${offPerfil}) scale(${r2((cajaPerfil / 110) * 1e4) / 1e4})">`, ...completa(COMPLETA).map((l) => `  ${l}`), `</g>`],
});
const bufPerfil = await png(perfil, lienzo);
const rp = await radioDelDibujo(bufPerfil, TINTA);
escribir("brand/perfil-1080.png", bufPerfil, `el símbolo llega al ${Math.round((rp.max / (lienzo / 2)) * 100)}% del radio del círculo`);

// Imagen para compartir links (Open Graph): el conjunto oscuro centrado. Mide
// 600 de ancho para que entre entero también cuando WhatsApp muestra la
// miniatura cuadrada (recorta el centro, 630 × 630).
const og = { w: 1200, h: 630 };
const anchoConjunto = 600;
const esc = anchoConjunto / conjuntoOscuro.w;
const altoConjunto = conjuntoOscuro.h * esc;
const interior = conjuntoOscuro.svg.replace(/^<svg[^>]*>\n/, "").replace(/<\/svg>\n$/, "");
const ogSvg = doc({
  ...og, fondo: TINTA,
  cuerpo: [
    `<g transform="translate(${r2((og.w - anchoConjunto) / 2)} ${r2((og.h - altoConjunto) / 2)}) scale(${r2(esc * 1e4) / 1e4})">`,
    interior,
    `</g>`,
  ],
});
escribir("brand/og-1200x630.png", await png(ogSvg, og.w, og.h), "1200 × 630");
// La que levanta el <head>. La plataforma busca /og.jpg: el middleware que
// escribe las etiquetas og: la encuentra sola y arma la dirección completa.
escribir("public/og.jpg", await png(ogSvg, og.w, og.h, "jpeg"), "1200 × 630 (la que levanta el <head>)");

await b.close();
