import { LOCAL_NAME_KEY } from "@/lib/local-name";

/**
 * Antes de que llegue el JS no hay React que sepa el nombre. Esto lo lee de lo
 * que dejó este aparato (solo lee el candado, no lo toca) y lo pone en el
 * atributo que muestra el CSS.
 */
const FILL_NAME = `try{var l=JSON.parse(localStorage.getItem("iman-floor-lock")||"null");var r=JSON.parse(localStorage.getItem("${LOCAL_NAME_KEY}")||"null");if(l&&r&&r.storeId===l.storeId&&r.name){document.getElementById("iman-open-label").setAttribute("data-label","Abriendo "+r.name)}}catch(e){}`;

/**
 * La pantalla mientras se abre el local. Toda la animación es CSS
 * (`.iman-open` en styles.css): arranca en el HTML del servidor, antes del JS,
 * y se corta en cuanto el local está listo. No espera a que termine.
 *
 * Tiene que quedar siempre en el mismo lugar del árbol: si React la vuelve a
 * montar, la animación arranca de nuevo.
 */
export function OpeningScreen({
  name,
  beforeJs = false,
}: {
  name?: string | null;
  beforeJs?: boolean;
}) {
  return (
    <div
      className="iman-open fixed inset-0 bg-[#14130f]"
      role="status"
      aria-label={name ? `Abriendo ${name}` : "Abriendo"}
    >
      <svg
        className="absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2"
        viewBox="0 0 110 110"
        aria-hidden="true"
      >
        <g className="iman-open-field" fill="none" stroke="#8eae8a" strokeLinecap="round">
          <path d="M 34,44 C 26,20 84,20 76,44" strokeWidth={5} />
          <path d="M 34,68 C 26,92 84,92 76,68" strokeWidth={5} />
          <path
            className="iman-open-outer"
            d="M 31,51 C 17,48 18,11 55,11 C 92,11 93,48 79,51"
            strokeWidth={3.5}
          />
          <path
            className="iman-open-outer"
            d="M 31,61 C 17,64 18,101 55,101 C 92,101 93,64 79,61"
            strokeWidth={3.5}
          />
        </g>
        <g className="iman-open-bars">
          <rect x="34" y="44" width="4" height="24" rx="1" fill="#8eae8a" />
          <rect x="40" y="44" width="2" height="24" rx="1" fill="#8eae8a" />
          <rect x="44" y="44" width="5" height="24" rx="1" fill="#8eae8a" />
          <rect x="51" y="44" width="2" height="24" rx="1" fill="#8eae8a" />
          <rect x="57" y="44" width="2" height="24" rx="1" fill="#ebe4d4" />
          <rect x="61" y="44" width="5" height="24" rx="1" fill="#ebe4d4" />
          <rect x="68" y="44" width="2" height="24" rx="1" fill="#ebe4d4" />
          <rect x="72" y="44" width="4" height="24" rx="1" fill="#ebe4d4" />
        </g>
        <rect
          className="iman-open-scan"
          x="29"
          y="43.4"
          width="52"
          height="1.2"
          rx="0.6"
          fill="#ebe4d4"
        />
      </svg>
      <p
        id="iman-open-label"
        className="iman-open-label absolute inset-x-4 top-[calc(50%+5rem)] text-center text-sm text-[#ebe4d4]/70"
        data-label={name ? `Abriendo ${name}` : undefined}
        suppressHydrationWarning
      />
      {beforeJs ? <script dangerouslySetInnerHTML={{ __html: FILL_NAME }} /> : null}
    </div>
  );
}
