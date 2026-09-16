import { speakNumberAR } from "./format";

let lastUtter: SpeechSynthesisUtterance | null = null;

function pickVoice(lang: string, gender: "female" | "male"): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang.split("-")[0]?.toLowerCase() ?? "es";
  const pool = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  const list = pool.length ? pool : voices;
  const want = gender === "male" ? /male|hombre|hombre/i : /female|mujer|female/i;
  return list.find((v) => want.test(v.name)) ?? list[0] ?? null;
}

export function speak(
  text: string,
  opts: { lang?: string; gender?: "female" | "male"; rate?: number; enabled?: boolean } = {},
): void {
  if (opts.enabled === false) return;
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (window.matchMedia("(max-width: 639px)").matches) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts.lang ?? "es-AR";
  u.rate = Math.min(2, Math.max(0.6, opts.rate ?? 1));
  const v = pickVoice(u.lang, opts.gender ?? "female");
  if (v) u.voice = v;
  lastUtter = u;
  window.speechSynthesis.speak(u);
}

export function speakPrice(
  name: string,
  price: number,
  opts: { lang?: string; gender?: "female" | "male"; rate?: number; enabled?: boolean } = {},
): void {
  speak(`${name}. ${speakNumberAR(price)}.`, opts);
}

export function beep(ok = true): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = ok ? 880 : 240;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.045, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
    osc.start(t);
    osc.stop(t + 0.1);
    osc.onended = () => ctx.close().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

export { lastUtter };
