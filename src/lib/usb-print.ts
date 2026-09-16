type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open: (opts: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
};

type SerialNav = {
  requestPort: () => Promise<SerialPortLike>;
  getPorts: () => Promise<SerialPortLike[]>;
};

function serialApi(): SerialNav | null {
  if (typeof navigator === "undefined") return null;
  const s = (navigator as Navigator & { serial?: SerialNav }).serial;
  return s ?? null;
}

let port: SerialPortLike | null = null;
let opened = false;

export function canThermalUsb(): boolean {
  return Boolean(serialApi());
}

export async function connectThermal(baud = 9600): Promise<{ ok: boolean; error?: string }> {
  const api = serialApi();
  if (!api) return { ok: false, error: "Este Chrome no habla USB serie. Usá el diálogo de impresión." };
  try {
    port = await api.requestPort();
    if (opened) {
      try {
        await port.close();
      } catch {
        /* already closed */
      }
      opened = false;
    }
    await port.open({ baudRate: baud });
    opened = true;
    return { ok: true };
  } catch (err) {
    port = null;
    opened = false;
    const msg = err instanceof Error ? err.message : "";
    if (/No port selected|NotFoundError/i.test(msg) || (err as { name?: string })?.name === "NotFoundError") {
      return { ok: false, error: "No se eligió impresora." };
    }
    return { ok: false, error: "No se pudo abrir el puerto USB." };
  }
}

async function ensurePort(baud: number): Promise<SerialPortLike | null> {
  if (port && opened && port.writable) return port;
  const api = serialApi();
  if (!api) return null;
  const known = await api.getPorts();
  const next = port ?? known[0];
  if (!next) return null;
  if (!opened) {
    try {
      await next.open({ baudRate: baud });
      opened = true;
      port = next;
    } catch {
      return null;
    }
  }
  return port;
}

export async function printThermal(bytes: Uint8Array, baud = 9600): Promise<boolean> {
  const p = await ensurePort(baud);
  if (!p?.writable) return false;
  const writer = p.writable.getWriter();
  try {
    await writer.write(bytes);
    return true;
  } catch {
    return false;
  } finally {
    writer.releaseLock();
  }
}

export async function hasRememberedPrinter(): Promise<boolean> {
  const api = serialApi();
  if (!api) return false;
  if (port) return true;
  const known = await api.getPorts();
  return known.length > 0;
}
