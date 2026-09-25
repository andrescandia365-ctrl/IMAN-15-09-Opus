/** Dónde va a cobrar el local, según lo que eligió el dueño. */
export type CobraEn = "computadora" | "tablet" | "celu";

export const COBRA_EN: { id: CobraEn; label: string }[] = [
  { id: "computadora", label: "Computadora o notebook" },
  { id: "tablet", label: "Tablet" },
  { id: "celu", label: "Solo tengo celular" },
];

export function esCobraEn(v: unknown): v is CobraEn {
  return v === "computadora" || v === "tablet" || v === "celu";
}

/** "Solo tengo celular", contestado desde el celu: ese celu queda como caja. */
export const AVISO_CELU_CAJA =
  "Este celu va a ser la caja del local: cobra, abre y cierra el turno. Si después sumás otro aparato, le manda los tickets.";

/** "Solo tengo celular", contestado desde otro aparato (una PC, una tablet). */
export const AVISO_CELU_PASAR =
  "Para cobrar desde el celu, abrí IMAN en el celu y pasale la caja desde Dueño → Local.";

/** "Solo tengo celular", contestado desde el celu en un local que ya vende o ya tiene caja. */
export const AVISO_CELU_PASAR_ACA =
  "Este local ya tiene ventas o una caja: para que este celu cobre, pasale la caja desde Dueño → Local, con el PIN.";
