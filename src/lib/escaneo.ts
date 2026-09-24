/**
 * Las reglas del escaneo, sin navegador: qué cuenta como lectura nueva de la
 * cámara, qué parte del cuadro se mira, y cómo se distingue un lector en modo
 * teclado de una persona tipeando.
 */

/**
 * Cuadros seguidos sin ver un código para darlo por ido. Un código quieto a la
 * vista se pierde uno o dos cuadros sueltos (movimiento, reflejo); tres
 * seguidos ya es que el producto salió. A ~10 cuadros por segundo son unos
 * 300 ms: pasar el segundo alfajor igual lleva más que eso.
 */
export const AUSENTE_CUADROS = 3;

/**
 * Lecturas nuevas por presencia, no por tiempo: un código cuenta cuando
 * aparece, se ignora mientras siga a la vista, y vuelve a contar si desaparece
 * `AUSENTE_CUADROS` cuadros seguidos y reaparece.
 */
export function crearPresencia(ausente = AUSENTE_CUADROS) {
  const faltas = new Map<string, number>();
  return {
    cuadro(codigos: string[]): string[] {
      const ahora = new Set(codigos.filter(Boolean));
      const nuevos: string[] = [];
      for (const c of ahora) {
        if (!faltas.has(c)) nuevos.push(c);
        faltas.set(c, 0);
      }
      for (const [c, n] of faltas) {
        if (ahora.has(c)) continue;
        if (n + 1 >= ausente) faltas.delete(c);
        else faltas.set(c, n + 1);
      }
      return nuevos;
    },
  };
}

/** Pausa mínima entre cuadros: más de ~10 lecturas por segundo no le sirven a nadie pasando productos. */
export const CUADRO_MIN_MS = 100;

/**
 * Cuánto esperar hasta el próximo cuadro según lo que tardó este: nunca menos
 * que lo que tarda leer, así el detector trabaja como mucho la mitad del
 * tiempo. Un celu lento se frena solo; uno rápido va a 10 por segundo.
 */
export function pausaEntreCuadros(detectarMs: number): number {
  return Math.max(CUADRO_MIN_MS, Math.round(detectarMs));
}

/**
 * La parte del video que se ve en pantalla con `object-fit: cover`, en píxeles
 * del video. Solo esa se manda a leer: lo que el encargado no ve no se cobra.
 */
export function recorteVisible(
  videoAncho: number,
  videoAlto: number,
  cajaAncho: number,
  cajaAlto: number,
): { x: number; y: number; ancho: number; alto: number } {
  const escala = Math.max(cajaAncho / videoAncho, cajaAlto / videoAlto);
  const ancho = Math.min(videoAncho, cajaAncho / escala);
  const alto = Math.min(videoAlto, cajaAlto / escala);
  return { x: (videoAncho - ancho) / 2, y: (videoAlto - alto) / 2, ancho, alto };
}

/**
 * Un lector en modo teclado escribe todo el código en milisegundos y casi
 * siempre cierra con Enter. Una persona tarda más de 40 ms entre tecla y tecla
 * aun apurada, y el teclado del celu con Android ni siquiera manda las teclas
 * (llegan como "Unidentified").
 */
export const ENTRE_TECLAS_MS = 40;
/** Largo mínimo de un escaneo. Los códigos cortos del local tienen 4 o más. */
export const LARGO_MIN = 4;
/** Lectores sin Enter al final: el código termina cuando dejan de llegar teclas. */
export const FIN_SIN_ENTER_MS = 80;
/** Sin Enter solo se acepta un código de barras largo (EAN-8 o más). */
export const LARGO_SIN_ENTER = 8;

export function crearLectorTeclado() {
  let buffer = "";
  let ultima = -Infinity;
  return {
    /** Una tecla. Devuelve el código si con ella terminó un escaneo. */
    tecla(key: string, t: number): string | null {
      if (key === "Enter") {
        const codigo = buffer;
        buffer = "";
        return codigo.length >= LARGO_MIN && t - ultima <= FIN_SIN_ENTER_MS ? codigo : null;
      }
      if (key.length !== 1) return null;
      if (t - ultima > ENTRE_TECLAS_MS) buffer = "";
      buffer += key;
      ultima = t;
      return null;
    },
    /** Para lectores sin Enter: llamarlo cuando pasó un rato sin teclas. */
    fin(t: number): string | null {
      if (buffer.length < LARGO_SIN_ENTER || t - ultima < FIN_SIN_ENTER_MS) return null;
      const codigo = buffer;
      buffer = "";
      return codigo;
    },
    /** Hay un escaneo a medio llegar (sirve para no mandar el Enter a otro lado). */
    enCurso(t: number): boolean {
      return buffer.length > 1 && t - ultima <= ENTRE_TECLAS_MS;
    },
  };
}
