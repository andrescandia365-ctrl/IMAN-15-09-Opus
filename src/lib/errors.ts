/**
 * Traduce fallas técnicas a lenguaje de piso. Un "Unauthorized" en pantalla no
 * le dice nada al encargado ni al dueño.
 */
const KNOWN: [RegExp, string][] = [
  [/^unauthorized$/i, "Se cerró la sesión. Entrá de nuevo."],
  [/^forbidden$/i, "Esta cuenta no tiene permiso para eso."],
  [/failed to fetch|networkerror|network error|load failed/i, "Sin red. Quedó en este aparato."],
  [/timed? ?out/i, "La nube tardó demasiado. Probá de nuevo."],
  [/^\d{3}\b|internal server error/i, "La nube no respondió bien. Probá de nuevo."],
];

export function errorText(err: unknown, fallback = "No se pudo"): string {
  const raw = (err instanceof Error ? err.message : typeof err === "string" ? err : "").trim();
  const known = KNOWN.find(([re]) => re.test(raw));
  if (known) return known[1];
  return raw || fallback;
}
