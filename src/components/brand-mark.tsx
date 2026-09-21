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
 * El símbolo de IMAN: un imán de herradura boca arriba con su línea de campo.
 * Es el mismo dibujo que el ícono instalado (`brand/simbolo-simple.svg`), para
 * que el logo de arriba a la izquierda y el de la pantalla de inicio del celu
 * sean la misma cosa. Acá va la versión de una línea: en pantalla se muestra
 * chico y las tres finas se empastan.
 */
export function ImanMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 110 110" className={cn("size-8", className)} aria-hidden>
      <rect width="110" height="110" fill="#14130f" />
      <path d="M 28,42 V 68 A 27 27 0 0 0 82 68 V 42 H 64 V 68 A 9 9 0 0 1 46 68 V 42 Z" fill="#ebe4d4" />
      <rect x="28" y="42" width="18" height="13" fill="#8eae8a" />
      <rect x="64" y="42" width="18" height="13" fill="#8eae8a" />
      <path d="M 33,34 Q 55,15 77,34" stroke="#8eae8a" strokeWidth="7" fill="none" strokeLinecap="round" />
    </svg>
  );
}
