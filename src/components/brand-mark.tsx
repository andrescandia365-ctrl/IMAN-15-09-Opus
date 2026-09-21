import { cn } from "@/lib/utils";

export function BrandMark({
  src,
  className,
  markClassName,
}: {
  src?: string | null;
  className?: string;
  markClassName?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn("size-8 shrink-0 rounded-md object-cover", className)}
      />
    );
  }
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center overflow-hidden rounded-md", className)}>
      <ImanMark className={cn("size-full", markClassName)} />
    </span>
  );
}

/**
 * El símbolo de IMAN: un código de barras que es a la vez un imán, con el polo
 * verde a la izquierda, el crema a la derecha y las líneas de campo por arriba
 * y por abajo. Es el mismo dibujo que el favicon (`brand/simbolo-simplificado.svg`,
 * que sale de `scripts/brand-icons.mjs`): si cambia el símbolo, se cambian los
 * dos. Va la simplificada porque en pantalla se muestra a 32 px y las barras
 * finas de la completa se empastan.
 */
export function ImanMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 110 110" className={cn("size-8", className)} aria-hidden>
      <rect width="110" height="110" fill="#14130f" />
      <path d="M 34,44 C 26,18 84,18 76,44" stroke="#8eae8a" strokeWidth="8" fill="none" strokeLinecap="round" />
      <path d="M 34,68 C 26,94 84,94 76,68" stroke="#8eae8a" strokeWidth="8" fill="none" strokeLinecap="round" />
      <rect x="34" y="44" width="8" height="24" rx="1" fill="#8eae8a" />
      <rect x="46" y="44" width="6" height="24" rx="1" fill="#8eae8a" />
      <rect x="58" y="44" width="6" height="24" rx="1" fill="#ebe4d4" />
      <rect x="68" y="44" width="8" height="24" rx="1" fill="#ebe4d4" />
    </svg>
  );
}
