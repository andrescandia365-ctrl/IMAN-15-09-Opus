/**
 * Qué tipo de aparato es: para decirle al dueño en palabras qué aparato es la
 * caja ("un celular desde el jueves 24/09"). No decide permisos: eso es el rol
 * (rol.ts). Lo manda el aparato al tomar la caja.
 */
export type TipoAparato = "celu" | "tablet" | "computadora";

export function esTipoAparato(v: unknown): v is TipoAparato {
  return v === "celu" || v === "tablet" || v === "computadora";
}

/**
 * Con pantalla táctil como puntero principal: el lado corto de la pantalla
 * separa el celu de la tablet. Con mouse, es una computadora.
 */
export function tipoPorPantalla(tactil: boolean, ladoCorto: number): TipoAparato {
  if (!tactil) return "computadora";
  return ladoCorto < 600 ? "celu" : "tablet";
}

export function tipoDeEsteAparato(): TipoAparato {
  if (typeof window === "undefined") return "computadora";
  const tactil = window.matchMedia("(pointer: coarse)").matches;
  return tipoPorPantalla(tactil, Math.min(window.screen.width, window.screen.height));
}

const NOMBRE: Record<TipoAparato, string> = {
  celu: "un celular",
  tablet: "una tablet",
  computadora: "una computadora",
};

/**
 * "un celular, desde el jueves 24/09 a las 10:30". Sin tipo (una caja tomada
 * antes de guardarlo) dice "otro aparato"; si es este, lo dice.
 */
export function describirCaja(
  caja: { esEste: boolean; tipo: TipoAparato | null; desde: string | null },
  ahora = new Date(),
): string {
  const quien = caja.esEste
    ? `este aparato${caja.tipo ? ` (${NOMBRE[caja.tipo].replace(/^una? /, "")})` : ""}`
    : caja.tipo
      ? NOMBRE[caja.tipo]
      : "otro aparato";
  const desde = caja.desde ? desdeCuando(new Date(caja.desde), ahora) : "";
  return desde ? `${quien}, ${desde}` : quien;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const dos = (n: number) => String(n).padStart(2, "0");

/** A mano y en 24 horas: el formato de la máquina cambia entre navegadores. */
function desdeCuando(d: Date, ahora: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const hora = `${dos(d.getHours())}:${dos(d.getMinutes())}`;
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(ahora) - dia(d)) / 86_400_000);
  if (dias === 0) return `desde hoy a las ${hora}`;
  if (dias === 1) return `desde ayer a las ${hora}`;
  return `desde el ${DIAS[d.getDay()]} ${dos(d.getDate())}/${dos(d.getMonth() + 1)} a las ${hora}`;
}
