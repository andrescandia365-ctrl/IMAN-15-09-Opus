import { formatARS, formatDateTime, PAY_LABEL } from "@/lib/format";
import { TICKET_FISCAL_SHORT } from "@/lib/fiscal";
import { encodeEscPosTicket } from "@/lib/escpos";
import { printThermal } from "@/lib/usb-print";
import type { PayMethod, Product, Sale, Settings } from "@/lib/types";

export function printSlip(title: string, lines: string[]): boolean {
  const w = window.open("", "iman-print", "width=360,height=640");
  if (!w) return false;
  const body = lines.map((l) => `<div>${escapeHtml(l) || "&nbsp;"}</div>`).join("");
  w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body {
      font-family: ui-monospace, "IBM Plex Mono", monospace;
      font-size: 12px;
      line-height: 1.35;
      width: 72mm;
      margin: 0;
      color: #111;
    }
    h1 { font-size: 15px; margin: 0 0 8px; font-weight: 600; }
    .muted { font-size: 10px; color: #444; margin-bottom: 8px; }
    hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
  </style>
</head>
<body>
  <h1>IMAN</h1>
  <div class="muted">${escapeHtml(title)}</div>
  <hr />
  ${body}
  <hr />
  <div class="muted">80 mm · impresora térmica</div>
</body>
</html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}

export async function printTicket(opts: {
  sale: Sale;
  store: string;
  city?: string;
  baud?: number;
  header?: string;
  footer?: string;
  thanks?: string;
  mm?: 58 | 80;
}): Promise<boolean> {
  const { sale, store, city } = opts;
  const change =
    sale.paymentMethod === "efectivo" && sale.paid != null ? Math.max(0, sale.paid - sale.total) : 0;
  const pay = PAY_LABEL[sale.paymentMethod as PayMethod] ?? sale.paymentMethod;
  const nro = sale.id.replace(/^sa_/, "").slice(-8).toUpperCase();
  const bytes = encodeEscPosTicket({
    store,
    city: city?.trim() ?? "",
    when: formatDateTime(sale.createdAt),
    nro,
    items: sale.items.map((it) => ({
      qty: it.qty,
      name: it.name,
      unit: formatARS(it.price),
      sum: formatARS(it.price * it.qty),
    })),
    pay,
    total: formatARS(sale.total),
    paid: sale.paid != null ? formatARS(sale.paid) : undefined,
    change: change > 0 ? formatARS(change) : undefined,
  });
  const usb = await printThermal(bytes, opts.baud ?? 9600);
  if (usb) return true;
  return printTicketDialog(opts);
}

function printTicketDialog(opts: { sale: Sale; store: string; city?: string }): boolean {
  const { sale, store, city } = opts;
  const w = window.open("", "iman-ticket", "width=360,height=720");
  if (!w) return false;
  const rows = sale.items
    .map((it) => {
      const name = escapeHtml(it.name);
      const qty = it.qty;
      const unit = formatARS(it.price);
      const sum = formatARS(it.price * it.qty);
      return `<tr><td>${qty}</td><td>${name}</td><td class="r">${unit}</td><td class="r">${sum}</td></tr>`;
    })
    .join("");
  const change =
    sale.paymentMethod === "efectivo" && sale.paid != null ? Math.max(0, sale.paid - sale.total) : 0;
  const pay = PAY_LABEL[sale.paymentMethod as PayMethod] ?? sale.paymentMethod;
  const nro = sale.id.replace(/^sa_/, "").slice(-8).toUpperCase();
  const place = city?.trim() || "";
  w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Ticket ${nro}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body { font-family: ui-monospace, "IBM Plex Mono", monospace; font-size: 12px; width: 72mm; margin: 0; color: #111; }
    h1 { font-size: 16px; margin: 0; text-align: center; }
    .brand { font-size: 11px; letter-spacing: .18em; text-align: center; margin-bottom: 4px; }
    .muted { font-size: 11px; color: #333; text-align: center; }
    hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    .r { text-align: right; white-space: nowrap; }
    .tot { font-size: 16px; font-weight: 700; }
    .slogan { text-align: center; font-size: 11px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="brand">IMAN</div>
  <h1>${escapeHtml(store)}</h1>
  ${place ? `<div class="muted">${escapeHtml(place)}</div>` : ""}
  <div class="muted">${escapeHtml(formatDateTime(sale.createdAt))}</div>
  <div class="muted">Ticket ${escapeHtml(nro)}</div>
  <hr />
  <table>
    <tr><td>Cant</td><td>Producto</td><td class="r">P.unit</td><td class="r">Imp.</td></tr>
    ${rows}
  </table>
  <hr />
  <table>
    <tr><td>TOTAL</td><td class="r tot">${formatARS(sale.total)}</td></tr>
    <tr><td>${escapeHtml(pay)}</td><td class="r">${sale.paid != null ? formatARS(sale.paid) : formatARS(sale.total)}</td></tr>
    ${change ? `<tr><td>Vuelto</td><td class="r">${formatARS(change)}</td></tr>` : ""}
  </table>
  <hr />
  <div class="slogan">Números claros.<br/>Local que crece.</div>
  <div class="muted" style="margin-top:8px">${escapeHtml(TICKET_FISCAL_SHORT)}</div>
</body>
</html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&" + "amp;";
    if (ch === "<") return "&" + "lt;";
    if (ch === ">") return "&" + "gt;";
    if (ch === '"') return "&" + "quot;";
    return "&#39;";
  });
}

export function ticketPrintOpts(settings: Settings): {
  header?: string;
  footer?: string;
  thanks?: string;
  mm: 58 | 80;
} {
  return {
    header: settings.ticketHeader?.trim() || undefined,
    footer: settings.ticketFooter?.trim() || undefined,
    thanks: settings.ticketThanks?.trim() || "Gracias por tu compra",
    mm: settings.printerMm === 58 ? 58 : 80,
  };
}

export function printGondolaLabels(products: Product[], store: string): boolean {
  const w = window.open("", "iman-gondola", "width=900,height=700");
  if (!w) return false;
  const cells = products
    .filter((p) => p.active)
    .map((p) => `<div class="cell"><div class="name">${escapeHtml(p.name)}</div><div class="price">${formatARS(p.price)}</div><div class="code">${escapeHtml(p.barcode || "")}</div></div>`)
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Etiquetas</title>
  <style>@page{size:A4;margin:10mm}body{font-family:sans-serif}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6mm}.cell{border:1px solid #222;padding:6mm 4mm}.name{font-size:13px;font-weight:600;min-height:2.4em}.price{font-size:22px;font-weight:700}.code{font-size:10px;font-family:monospace;color:#444}</style>
  </head><body><h1>${escapeHtml(store)}</h1><div class="grid">${cells}</div></body></html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}

export function printListaLabels(products: Product[], store: string): boolean {
  const w = window.open("", "iman-lista", "width=900,height=700");
  if (!w) return false;
  const rows = products
    .filter((p) => p.active)
    .map(
      (p) =>
        `<tr><td class="name">${escapeHtml(p.name)}</td><td class="price">${formatARS(p.price)}</td><td class="code">${escapeHtml(p.barcode || "")}</td></tr>`,
    )
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Lista de precios</title>
  <style>@page{size:A4;margin:12mm}body{font-family:sans-serif;color:#111}h1{font-size:18px;margin:0 0 8px}table{width:100%;border-collapse:collapse}th{background:#f5d76e;text-align:left;padding:8px;font-size:12px;text-transform:uppercase;letter-spacing:.08em}td{border-bottom:1px solid #ddd;padding:8px}td.price{font-size:18px;font-weight:700;white-space:nowrap}td.code{font-family:monospace;font-size:11px;color:#444}</style>
  </head><body><h1>${escapeHtml(store)}</h1><table><thead><tr><th>Producto</th><th>Precio</th><th>Código</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}

export function printShortCodeSheet(
  items: { code: string; name: string }[],
  store: string,
): boolean {
  const w = window.open("", "iman-codigos", "width=720,height=900");
  if (!w) return false;
  const body = items
    .map(
      (it) =>
        `<tr><td class="code">${escapeHtml(it.code)}</td><td class="name">${escapeHtml(it.name)}</td></tr>`,
    )
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Códigos</title>
  <style>
    @page{size:A4;margin:14mm}
    body{font-family:"IBM Plex Sans",sans-serif;color:#111;margin:0}
    h1{font-size:13px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 4px;color:#444}
    h2{font-size:22px;margin:0 0 12px}
    table{width:100%;border-collapse:collapse;border:3px solid #c45c8a}
    td{border-bottom:1px solid #e7c3d8;padding:8px 12px;vertical-align:middle}
    td.code{width:18%;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
    td.name{font-size:16px;font-weight:600;text-transform:uppercase}
  </style>
  </head><body>
  <h1>${escapeHtml(store)}</h1>
  <h2>Códigos</h2>
  <table><tbody>${body}</tbody></table>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}
