/** Andrés — dueño del Estudio. Este archivo viaja al navegador: nunca la clave. */
export const FOUNDER_EMAIL = "andrescandia365@gmail.com";
export const FOUNDER_NAME = "Andrés Candia";

export function isFounderEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === FOUNDER_EMAIL;
}
