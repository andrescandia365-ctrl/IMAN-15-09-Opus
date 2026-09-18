/**
 * El punto de partida de un aparato en la cinta de un local.
 *
 * La primera vez que un aparato baja, la historia de la cinta ya está metida
 * en su estado de otra forma (la fotocopia con la que arrancó) o no le
 * corresponde (la PC que nunca bajó y se corrigió a mano). Aplicarla entera
 * contaría dos veces ajustes viejos y pisaría precios nuevos con viejos. Así
 * que esa vez da por vista la historia sin aplicarla, y desde ahí baja normal.
 *
 * - "skip": salteando la historia. Dura hasta llegar al final de la cinta, que
 *   puede llevar más de un toque si hay mucha.
 * - "live": baja y aplica lo ajeno, como siempre.
 *
 * La marca vive en el mismo IndexedDB que los datos del local: si Chrome los
 * borra, se borra con ellos y el aparato recuperado vuelve a arrancar desde su
 * fotocopia. Un aparato sin marca que ya venía bajando (cursor > 0) es uno de
 * antes de este cambio: sigue normal, no se le saltea nada.
 */
export type PullStart = { mode: "skip" | "live"; at: string };

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
  const desde = saved?.at ?? at;
  if (mode === "skip" && more) return { mode: "skip", at: desde };
  return { mode: "live", at: desde };
}
