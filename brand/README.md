# Marca IMAN

**IMAN**, siempre en mayúsculas y sin tilde. Es un acrónimo: *Inventario y
Manejo de Artículos para Negocios*.

El símbolo es un **código de barras que es a la vez un imán**: las barras de
la izquierda en verde y las de la derecha en crema, como los dos polos, y las
líneas de campo que salen de un extremo y vuelven al otro, por arriba y por
abajo.

## Colores

| color | nombre | dónde |
|---|---|---|
| `#14130f` | tinta | fondo oscuro |
| `#ebe4d4` | crema | polo derecho, la palabra sobre tinta |
| `#8eae8a` | verde | polo izquierdo y líneas de campo, sobre tinta |
| `#3f6b48` | verde oscuro | lo mismo, sobre fondo claro |
| `#fffaf0` | papel | fondo claro |

## Qué versión va dónde

| archivo | para qué |
|---|---|
| `simbolo-completo.svg` | la de siempre, sobre tinta. De **64 px para arriba** |
| `simbolo-simplificado.svg` | de **48 px para abajo**: favicon y miniaturas. Menos barras y líneas más gruesas, porque las finas se empastan |
| `simbolo-negativo.svg` | sobre fondos claros (papel, blanco) |
| `simbolo-un-color-tinta-sobre-papel.svg` | impresión a una tinta: sello, fotocopia, ticket |
| `simbolo-un-color-papel-sobre-tinta.svg` | lo mismo, calado sobre fondo oscuro |
| `conjunto-oscuro.svg` | símbolo + palabra, crema sobre tinta |
| `conjunto-claro.svg` | símbolo + palabra, tinta sobre papel |
| `perfil-1080.png` | foto de perfil en redes. Pensada para recorte circular |
| `og-1200x630.png` | la imagen que aparece al pasar el link por WhatsApp |

Las versiones de un color no tienen opacidades: la impresión a una tinta no
tiene medios tonos. Los dos polos se distinguen igual por el hueco del medio.

## Espacio libre

Alrededor del símbolo va siempre un margen libre de **X**, donde **X es la
mitad de la altura del bloque de barras** (12 de las 110 unidades de la
caja). Como se mide con el propio símbolo, vale a cualquier tamaño.

Adentro de ese margen no va nada: ni texto, ni otro logo, ni el borde de la
hoja. Los archivos del conjunto ya vienen con ese margen incluido.

## El conjunto horizontal

- La caja del símbolo mide **1,4 veces** el tamaño de la letra.
- Entre el símbolo y la palabra hay **0,35 veces** el tamaño de la letra,
  medido de lo que se ve a lo que se ve (del borde del dibujo al remate de
  la I).
- Las mayúsculas van centradas con el bloque de barras.
- La palabra es **Fraunces 500** (tamaño óptico 36) y va **convertida a
  trazos**: se ve igual en cualquier máquina, tenga o no la letra instalada.

## Lo que no se hace

- **Estirar** ni aplastar: se agranda o se achica parejo.
- **Cambiar los colores**, ni siquiera "parecidos". Para fondo claro está el
  negativo; para una tinta, las de un color.
- **Rotar** ni inclinar.
- Ponerlo **sobre fotos o fondos sin contraste**. Si el fondo es cargado, va
  sobre su cuadrado de tinta o de papel.
- Escribir la palabra IMAN con otra letra al lado del símbolo: para eso están
  los conjuntos.

---

## Para la app

Todo sale de un solo script, que tiene la geometría del símbolo:

```bash
node scripts/brand-icons.mjs
```

Además de los archivos de esta carpeta, escribe los de la app:

```
public/favicon.svg              simplificada
public/favicon.ico              simplificada, 16 + 32 + 48 adentro
public/icon-192.png             completa, cuadrado de esquinas redondeadas
public/icon-512.png             completa, cuadrado de esquinas redondeadas
public/icon-1024.png            la misma, 1024
public/icon-maskable-1024.png   completa, fondo hasta el borde (Android)
public/icon-maskable-512.png    la misma, más chica
public/icon-maskable-192.png    la misma, más chica
public/apple-touch-icon.png     completa, 180, fondo sólido (iOS no admite transparencia)
public/og.jpg                   la misma imagen para compartir, en JPG
```

**El maskable se mide, no se supone.** Con él Android arma el ícono
adaptable, que recorta con la forma del lanzador y, en la pantalla de
arranque, con un círculo. Lo que ninguna máscara recorta son los 66 dp del
centro de un lienzo de 108 dp: la especificación oficial de Android, más
estricta que el 80% de la especificación web de maskable. El script rasteriza
el 1024 y busca el píxel del dibujo más lejano al centro: con el símbolo al
76% llega a 310,1 px y la zona segura es de 312,9 px. Si no entra, lo achica
(nunca lo recorta).

**Por qué hay 1024.** Desde Android 12 la pantalla de arranque dibuja el
ícono adaptable a unos 160 dp. Con solo 512, en un celu de densidad alta hay
que agrandarlo y se ve pixelado.

**El SVG no va en el manifest.** `favicon.svg` es la versión simplificada,
para 48 px o menos: sigue como favicon, pero en el manifest figuraba como
ícono de cualquier tamaño.

**En la PC, el dock y la barra de tareas muestran la completa achicada.**
Probado instalando: Chrome genera los íconos del sistema (32, 48, 128…)
achicando el ícono grande del manifest, aunque el manifest traiga uno chico.
Un ícono de 48 con la simplificada no cambia nada ahí; por eso no está.

La palabra en trazos vive en `scripts/brand-palabra.mjs`.

El mismo dibujo simplificado está también en `src/components/brand-mark.tsx`
(`ImanMark`), que es el logo de arriba a la izquierda en la app. Si cambia el
símbolo, hay que cambiar los dos.
