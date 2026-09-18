/**
 * El punto de partida de un aparato en la cinta de un local.
 *
 * Hay dos formas de empezar, y cuál toca se decide por de dónde salió el
 * estado del aparato:
 *
 * - Arranca de la fotocopia (no tenía copia propia: es nuevo o Chrome le borró
 *   los datos). La fotocopia dice hasta dónde de la cinta llega (CopyMark): el
 *   aparato pone su cursor ahí y aplica lo que vino después, salvo lo que el
 *   aparato que la subió hizo antes de la foto, que ya está adentro. Se decide
 *   al abrir la app, cuando se carga la fotocopia (fromCopyStart).
 *
 * - Tiene datos propios y nunca bajó (la PC de antes de que Sincronizar
 *   bajara). Aplicarle la historia entera contaría dos veces ajustes que ya se
 *   corrigieron a mano y pisaría precios nuevos con viejos: da por vista la
 *   historia y baja normal desde ahí ("skip", que puede llevar más de un toque
 *   si hay mucha cinta).
 *
 * Las dos se distinguen porque la primera deja su marca al cargar la
 * fotocopia, antes de la primera sincronización; la segunda llega a su primera
 * sincronización sin marca y con el cursor en 0. Un aparato sin marca que ya
 * venía bajando (cursor > 0) es uno de antes de este cambio: sigue normal.
 *
 * La marca vive en el mismo IndexedDB que los datos del local: si Chrome los
 * borra, se borra con ellos.
 */
import type { CopyMark } from "./types";

export type PullStart = {
  mode: "skip" | "live";
  at: string;
  /** Arrancó de una fotocopia: lo de ese aparato hasta ese momento ya estaba adentro. */
  desde?: { device: string; at: string };
};

export function pullMode(
  saved: PullStart | null,
  lastPullSeq: number,
): { mode: PullStart["mode"]; arranca: boolean } {
  if (saved) return { mode: saved.mode, arranca: false };
  if (lastPullSeq > 0) return { mode: "live", arranca: false };
  return { mode: "skip", arranca: true };
}

/** La marca que queda después de bajar. El salteo termina recién al llegar al final de la cinta. */
export function pullStartAfter(
  mode: PullStart["mode"],
  more: boolean,
  saved: PullStart | null,
  at: string,
): PullStart {
  const base = { at: saved?.at ?? at, ...(saved?.desde ? { desde: saved.desde } : {}) };
  if (mode === "skip" && more) return { mode: "skip", ...base };
  return { mode: "live", ...base };
}

/**
 * El punto de partida de un aparato que arranca de la fotocopia, o `null` si
 * no corresponde: ya tiene su marca, o la fotocopia no dice hasta dónde llega
 * (una vieja, o de un aparato que todavía no seguía la cinta). En ese caso su
 * primera sincronización arranca desde ahora, como antes.
 */
export function fromCopyStart(
  saved: PullStart | null,
  mark: CopyMark | undefined,
  at: string,
): { cursor: number; start: PullStart } | null {
  if (saved || !mark || !Number.isFinite(mark.seq) || mark.seq < 0 || !mark.device || !mark.at) return null;
  return { cursor: mark.seq, start: { mode: "live", at, desde: { device: mark.device, at: mark.at } } };
}

/** Lo que el aparato que subió la fotocopia hizo antes de la foto ya está adentro: no se aplica de nuevo. */
export function alreadyInCopy(ev: { deviceId: string; at: string }, desde: PullStart["desde"]): boolean {
  return Boolean(desde && ev.deviceId === desde.device && ev.at <= desde.at);
}
