/** ESC/POS 80 mm, code page PC850 so ñ and accents survive cheap USB printers. */

const ESC = 0x1b;
const GS = 0x1d;

const PC850: Record<string, number> = {
  á: 0xa0,
  é: 0x82,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  ü: 0x81,
  ñ: 0xa4,
  Á: 0xb5,
  É: 0x90,
  Í: 0xd6,
  Ó: 0xe0,
  Ú: 0xe9,
  Ü: 0x9a,
  Ñ: 0xa5,
  "°": 0xf8,
  "¿": 0xa8,
  "¡": 0xad,
};

function bytesOf(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const mapped = PC850[ch];
    if (mapped != null) {
      out.push(mapped);
      continue;
    }
    const c = ch.charCodeAt(0);
    out.push(c >= 32 && c < 127 ? c : 63);
  }
  return out;
}

function line(text: string, width = 42): number[] {
  const cut = text.length > width ? text.slice(0, width) : text;
  return [...bytesOf(cut), 0x0a];
}

function padRow(left: string, right: string, width = 42): number[] {
  const room = Math.max(1, width - right.length);
  const l = left.length > room ? left.slice(0, room) : left;
  return line(`${l}${" ".repeat(width - l.length - right.length)}${right}`, width);
}

export function encodeEscPosTicket(opts: {
  store: string;
  city: string;
  when: string;
  nro: string;
  items: { qty: number; name: string; unit: string; sum: string }[];
  pay: string;
  total: string;
  paid?: string;
  change?: string;
  /** Lo descontado con promos, si hubo. */
  ahorro?: string;
}): Uint8Array {
  const b: number[] = [
    ESC, 0x40,
    ESC, 0x74, 0x02,
    ESC, 0x61, 0x01,
    ESC, 0x21, 0x00,
    ...line("IMAN"),
    ESC, 0x21, 0x30,
    ...line(opts.store),
    ESC, 0x21, 0x00,
  ];
  if (opts.city) b.push(...line(opts.city));
  b.push(...line(opts.when), ...line(`Ticket ${opts.nro}`));
  b.push(ESC, 0x61, 0x00);
  b.push(...line("-".repeat(42)));
  b.push(...padRow("Cant  Producto", "Importe"));
  for (const it of opts.items) {
    b.push(...padRow(`${it.qty} ${it.name}`, it.sum));
    if (it.unit) b.push(...line(`     ${it.unit} c/u`));
  }
  b.push(...line("-".repeat(42)));
  if (opts.ahorro) b.push(...padRow("Ahorro en promos", `-${opts.ahorro}`));
  b.push(ESC, 0x21, 0x20);
  b.push(...padRow("TOTAL", opts.total));
  b.push(ESC, 0x21, 0x00);
  b.push(...line(opts.pay));
  if (opts.paid) b.push(...line(`Pago ${opts.paid}`));
  if (opts.change) b.push(...line(`Vuelto ${opts.change}`));
  b.push(ESC, 0x61, 0x01);
  b.push(
    ...line(""),
    ...line("Numeros claros."),
    ...line("Local que crece."),
    ...line(""),
    ...line("No es factura. Consulta a tu contador."),
    ...line(""),
  );
  b.push(GS, 0x56, 0x41, 0x03);
  return new Uint8Array(b);
}
