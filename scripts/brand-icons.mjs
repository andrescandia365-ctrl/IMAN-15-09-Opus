/**
 * Rasteriza los íconos de marca desde `brand/*.svg`.
 *
 * No hay ImageMagick ni rsvg en el proyecto: se usa el Chromium que ya
 * viene con Playwright. El .ico se arma a mano (PNG adentro del contenedor
 * ICO, que es lo que entienden Windows y los navegadores de hoy).
 *
 *   node scripts/brand-icons.mjs
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const b = await chromium.launch();
const ctx = await b.newContext({ deviceScaleFactor: 1 });

async function png(svgPath, size) {
  const svg = readFileSync(svgPath, "utf8")
    .replace('width="110" height="110"', `width="${size}" height="${size}"`);
  const p = await ctx.newPage();
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<body style="margin:0;background:#14130f">${svg}</body>`);
  const buf = await p.locator("svg").screenshot({ omitBackground: false });
  await p.close();
  return buf;
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

const salidas = [
  ["brand/simbolo-completo.svg", 192, "public/icon-192.png"],
  ["brand/simbolo-completo.svg", 512, "public/icon-512.png"],
  ["brand/maskable.svg", 192, "public/icon-maskable-192.png"],
  ["brand/maskable.svg", 512, "public/icon-maskable-512.png"],
  ["brand/simbolo-completo.svg", 180, "public/apple-touch-icon.png"],
  // El plugin de la plataforma inyecta SIEMPRE un segundo <link apple-touch-icon>
  // apuntando acá (busca su propia URL, no si ya hay uno). En iOS puede ganar el
  // último, así que este archivo también lleva el símbolo de IMAN: gane el tag
  // que gane, el kiosquero ve el mismo ícono.
  ["brand/simbolo-completo.svg", 180, "public/__grok/icon-180.png"],
];
for (const [src, size, dest] of salidas) {
  writeFileSync(dest, await png(src, size));
  console.log(`  ${dest}  ${size}×${size}`);
}
const chicos = [];
for (const size of [16, 32, 48]) chicos.push({ size, buf: await png("brand/simbolo-simple.svg", size) });
writeFileSync("public/favicon.ico", ico(chicos));
console.log(`  public/favicon.ico  16+32+48`);
writeFileSync("public/favicon.svg", readFileSync("brand/simbolo-simple.svg", "utf8"));
console.log(`  public/favicon.svg  (simplificada)`);
await b.close();
