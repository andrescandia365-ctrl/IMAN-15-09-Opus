/**
 * El rol del aparato en el local. Es distinto del ancho de pantalla:
 *
 * - el ANCHO decide la disposición (vista de PC o vista de celu);
 * - el ROL decide los permisos: cobrar, abrir y cerrar turno, retiros, recibir
 *   los tickets de otros aparatos.
 *
 * Cada local tiene una sola caja, y la decide el servidor (caja.ts). Un local
 * sin caja anotada se comporta como siempre: cobra la pantalla de PC.
 */

/** Lo que el servidor dice de la caja de un local. */
export type CajaServidor = { device: string | null; ver: number };

export type Rol = "caja" | "piso" | "sin-asignar";

export function rolDe(caja: CajaServidor | null | undefined, esteAparato: string): Rol {
  if (!caja?.device) return "sin-asignar";
  return caja.device === esteAparato ? "caja" : "piso";
}

/** Cobrar, abrir y cerrar turno, retiros y recibir tickets de otros aparatos. */
export function puedeCobrar(rol: Rol, pantallaDeCelu: boolean): boolean {
  if (rol === "caja") return true;
  if (rol === "piso") return false;
  return !pantallaDeCelu;
}

/**
 * Entre lo que el aparato ya sabía y lo que acaba de llegar, se queda con la
 * versión más nueva. Una respuesta vieja que llega tarde no devuelve la caja.
 */
export function cajaMasNueva(
  sabida: CajaServidor | null | undefined,
  llega: CajaServidor | null | undefined,
): CajaServidor | null {
  if (!llega) return sabida ?? null;
  if (!sabida) return llega;
  return llega.ver >= sabida.ver ? llega : sabida;
}
