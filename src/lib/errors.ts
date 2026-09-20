/**
 * Traduce fallas técnicas a lenguaje de piso. Un "Unauthorized" en pantalla no
 * le dice nada al encargado ni al dueño.
 */
export const LOCAL_TOO_HEAVY =
  "No pude guardar el respaldo: el local es muy grande. Tocá Sincronizar. Si sigue, llamá a soporte.";

const KNOWN: [RegExp, string][] = [
  [/^unauthorized$/i, "Se cerró la sesión. Entrá de nuevo."],
  [/^forbidden$/i, "Esta cuenta no tiene permiso para eso."],
  [/failed to fetch|networkerror|network error|load failed/i, "Sin red. Quedó en este aparato."],
  [/pesa demasiado|bajá el catálogo|local es muy grande/i, LOCAL_TOO_HEAVY],
  [
    /the database system is starting|remaining connection slots|too many clients|econnreset|connect etimedout|connection terminated|connection timed out|timeout expired|computes? is (starting|unavailable)|waking/i,
    "La nube está despertando. Tocá de nuevo en un toque.",
  ],
  [/timed? ?out/i, "La nube tardó. Probá de nuevo."],
  [/^\d{3}\b|internal server error/i, "La nube no respondió bien. Probá de nuevo."],
];

/** Fallas típicas del primer request del día, cuando Neon todavía está levantando el compute. */
export function isCloudWaking(err: unknown): boolean {
  const raw = (err instanceof Error ? err.message : typeof err === "string" ? err : "").trim();
  return (
    /the database system is starting|remaining connection slots|too many clients|econnreset|connect etimedout|connection terminated|connection timed out|timeout expired|computes? is (starting|unavailable)|waking|timed? ?out/i.test(
      raw,
    )
  );
}

export function errorText(err: unknown, fallback = "No se pudo"): string {
  const raw = (err instanceof Error ? err.message : typeof err === "string" ? err : "").trim();
  const known = KNOWN.find(([re]) => re.test(raw));
  if (known) return known[1];
  return raw || fallback;
}
