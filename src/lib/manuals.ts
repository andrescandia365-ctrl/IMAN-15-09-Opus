export type ManualId = "seller" | "support" | "dev";

export const MANUALS: {
  id: ManualId;
  title: string;
  for: string;
  blocks: { h: string; p: string }[];
}[] = [
  {
    id: "seller",
    title: "Manual del vendedor IMAN",
    for: "Quien vende el pack e instala el primer día",
    blocks: [
      {
        h: "Qué prometemos",
        p: "La pistola vende sin internet. Lo que está en la nube es lo último que sincronizaron, no un milagro. Nunca digas “está todo backup siempre”.",
      },
      {
        h: "Instalación en la PC del local",
        p: "Chrome o Edge → Instalar IMAN. Ciudad del local (la que va en el ticket). Impresora térmica USB: Ajustes → Conectar impresora → Probar ticket. Clave del dueño: 4 a 8 números. El encargado no la usa para vender ni para caja.",
      },
      {
        h: "Sincronizar",
        p: "Una venta de prueba, botón Sincronizar, que diga Al día. El mail de la cuenta se escribe en el ticket del pack. Celular del encargado: misma cuenta, no es una segunda caja.",
      },
      {
        h: "Borrar Chrome o formatear",
        p: "Es tirar el cuaderno. Primero Sincronizar. Nadie formatea “por las dudas” un domingo sin ese paso. Si ya lo hicieron: mismo mail, instalar, sincronizar. El hueco es el día no subido, no el año.",
      },
      {
        h: "Ciudad en el ticket",
        p: "Cada local tiene su ciudad. Rosario no imprime CABA. Se carga al registrar el local o en Dueño → Local y plan. Cambia si el dueño mueve el kiosco de barrio.",
      },
      {
        h: "El ticket no es factura",
        p: "IMAN imprime el papel del mostrador. No es comprobante fiscal ni se conecta a ARCA. No prometas factura A/B/C. El dueño lleva eso con su contador. El ticket lo dice al pie.",
      },
    ],
  },
  {
    id: "support",
    title: "Soporte técnico IMAN",
    for: "Quien atiende el WhatsApp cuando “se borró todo” o no imprime",
    blocks: [
      {
        h: "Nunca el primer paso",
        p: "No pedir “borrar datos del sitio” ni “limpiar Chrome”. Eso tira el cuaderno local. Primero: ¿Sincronizar dice Al día? El número verde al lado del botón es lo que no subió.",
      },
      {
        h: "Orden para reinstalar",
        p: "1) Sincronizar. 2) Pendientes en cero. 3) Recién ahí reinstalar, cambiar PC o borrar Chrome. 4) Instalar IMAN, mismo mail, Sincronizar. Vuelve la foto más la cinta de eventos.",
      },
      {
        h: "Ya lo borraron",
        p: "No hay magia. Lo no sincronizado murió en esa PC. Lo sincronizado vuelve. No actives un backup completo cada minuto: eso es el techo de 10 mil locales, no una solución.",
      },
      {
        h: "Impresora USB 80 mm",
        p: "Chrome en la PC del mostrador. Dueño (con clave) → Local y plan → Conectar impresora. Elegir el puerto COM / USB. Baud 9600 salvo que la caja diga 115200. Probar ticket. Si Chrome no lista el puerto, el diálogo de impresión sigue siendo el plan B. El ticket dice que no es factura.",
      },
      {
        h: "Olvidé la clave (email)",
        p: "El dueño pide el enlace en IMAN → ¿Olvidaste la contraseña? Si no llega el mail, en el Taller está el último enlace. Copialo y mandalo por WhatsApp. Vale una hora.",
      },
      {
        h: "PIN del dueño",
        p: "Eso no es la contraseña de la cuenta. El encargado vende y hace caja sin PIN. Si olvidan el PIN del panel, el dueño entra con email y lo cambia en Local y plan.",
      },
      {
        h: "Qué es cada cosa",
        p: "Local = IndexedDB de ese Chrome. Cinta = ventas, stock, vencimientos. Nube = cinta + una foto al sincronizar. Chrome nuevo = aparato nuevo, misma cuenta, misma cinta.",
      },
    ],
  },
  {
    id: "dev",
    title: "Monitoreo hacia 10.000 locales",
    for: "Quien mira Neon, el taller y el techo de IMAN",
    blocks: [
      {
        h: "Qué no hacer",
        p: "No guardar el JSON entero del local a cada scan. Eso era el diseño viejo y no llega a 10 mil. La cinta de eventos (kiosk_event) más un snapshot al Sincronizar es el contrato.",
      },
      {
        h: "Números del taller",
        p: "Cuentas, locales, planes activos, sesiones abiertas, bytes de kiosk_store, filas y peso de kiosk_event. Cómodo publicado ≈ 2.000. Techo / meta = 10.000. Preview no cuenta.",
      },
      {
        h: "Alertas",
        p: "JSON promedio de un local > 1 MB: recortar historial o Neon se pone caro. Eventos que no se ackean: el botón Sincronizar se llena de pendientes — hay red o hay bug de push. Sesiones vs cuentas: si hay muchas sesiones y pocos planes, hay gente colgada sin pagar.",
      },
      {
        h: "Hostinger vs Neon",
        p: "Hostinger: landing, Woo, mint de códigos. Neon (o un VPS chico): auth, kiosk_store, kiosk_event. El POS no escribe en un Node compartido de Hostinger.",
      },
      {
        h: "Licencia",
        p: "El scan no pregunta al servidor. La licencia se mira al sincronizar y al entrar. Un plan vencido sigue vendiendo en el aparato; no abre otro asiento ni otro dispositivo nuevo.",
      },
      {
        h: "Cómo saber si estamos cerca",
        p: "Meta: accountCount / 10.000. Si el payload promedio × 10.000 entra en el plan de Neon con holgura, seguimos. Si kiosk_event crece más que kiosk_store, está bien: la cinta es el producto. Si al revés, alguien volvió a mandar blobs.",
      },
    ],
  },
];
