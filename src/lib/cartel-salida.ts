import { cartelSvg, historiaSvg, HISTORIA, type CartelDatos, type Estilo, type Medir } from "@/lib/carteles";
import { fuenteComoDataUri, type Fuente } from "@/lib/cartel-fuentes";
import { leerFoto } from "@/lib/fotos";

/** Un medidor de texto con la letra ya cargada en la página. */
export function medidor(familia: string): Medir {
  const ctx = document.createElement("canvas").getContext("2d");
  return (t, px) => {
    if (!ctx) return t.length * px * 0.55;
    ctx.font = `${px}px "${familia}"`;
    return ctx.measureText(t).width;
  };
}

/** La foto guardada en este aparato, como data URI para meterla en el SVG. */
export async function fotoDataUri(storeId: string, productId: string): Promise<string | null> {
  const blob = await leerFoto(storeId, productId).catch(() => null);
  if (!blob) return null;
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

/**
 * A4, o media hoja: dos carteles A5 en una hoja A4 apaisada, con la línea
 * para cortar. Todo en trazos: nítido en cualquier impresora.
 */
export function imprimirCartel(d: CartelDatos, e: Estilo, f: Fuente, formato: "a4" | "media", medir: Medir): boolean {
  const w = window.open("", "iman-cartel", "width=900,height=1000");
  if (!w) return false;
  const css = `@font-face{font-family:'${f.familia}';src:url('${window.location.origin}${f.archivo}') format('woff2');font-weight:${f.peso};}`;
  const cuerpo =
    formato === "a4"
      ? cartelSvg(d, e, medir, { ancho: "210mm", alto: "297mm", idPre: "a" })
      : `<div class="dos">${cartelSvg(d, e, medir, { ancho: "148.5mm", alto: "210mm", idPre: "a" })}<div class="corte"></div>${cartelSvg(d, e, medir, { ancho: "148.5mm", alto: "210mm", idPre: "b" })}</div>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Cartel</title><style>
    ${css}
    @page { size: A4 ${formato === "a4" ? "portrait" : "landscape"}; margin: 0; }
    html, body { margin: 0; padding: 0; }
    svg { display: block; }
    .dos { display: flex; width: 297mm; height: 210mm; position: relative; }
    .corte { position: absolute; left: 148.5mm; top: 0; bottom: 0; border-left: 0.3mm dashed #999; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style></head><body>${cuerpo}</body></html>`);
  w.document.close();
  const listo = async () => {
    try {
      await w.document.fonts.load(`40px "${f.familia}"`);
      await w.document.fonts.ready;
    } catch {
      /* imprime igual */
    }
    w.focus();
    w.print();
  };
  if (w.document.readyState === "complete") void listo();
  else w.addEventListener("load", () => void listo());
  return true;
}

/**
 * La imagen vertical (1080 × 1920) para el estado de WhatsApp y las
 * historias. En el celu abre Compartir; si el aparato no deja, la descarga.
 */
export async function compartirCartel(
  d: CartelDatos,
  e: Estilo,
  f: Fuente,
  local: string,
  medir: Medir,
  ciudad = "",
): Promise<"compartido" | "descargado" | "cancelado"> {
  const letra = await fuenteComoDataUri(f);
  const css = `@font-face{font-family:'${f.familia}';src:url(${letra}) format('woff2');font-weight:${f.peso};}`;
  const svg = historiaSvg(d, e, medir, local, css, ciudad);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    // El error del navegador viene en inglés: al kiosquero se le dice en castellano.
    await img.decode().catch(() => {
      throw new Error("No se pudo armar la imagen del cartel. Probá de nuevo.");
    });
    const canvas = document.createElement("canvas");
    canvas.width = HISTORIA.ancho;
    canvas.height = HISTORIA.alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo armar la imagen");
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    if (!blob) throw new Error("No se pudo armar la imagen");
    const archivo = new File([blob], "cartel.jpg", { type: "image/jpeg" });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: local });
        return "compartido";
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return "cancelado";
      }
    }
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = "cartel.jpg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return "descargado";
  } finally {
    URL.revokeObjectURL(url);
  }
}
