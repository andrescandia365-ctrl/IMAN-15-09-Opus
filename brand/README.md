# Marca IMAN

El símbolo es un **imán de herradura boca arriba con líneas de campo**. Cuerpo
crema, polos verdes, fondo oscuro.

| color | dónde |
|---|---|
| `#14130f` | fondo del ícono |
| `#ebe4d4` | cuerpo del imán |
| `#8eae8a` | polos y líneas de campo |

## Los tres archivos fuente

- **`simbolo-completo.svg`** — tres líneas de campo. De 64 px para arriba.
- **`simbolo-simple.svg`** — una sola línea. De 48 px para abajo: las tres
  finas se empastan y se ve un borrón.
- **`maskable.svg`** — el completo al 88%, para Android. Android recorta cada
  ícono con la forma del lanzador (círculo, squircle, gota) y solo garantiza
  el **80% central**. Medido: el símbolo ocupa 64,5% del diámetro, así que
  entra con 39,7 px de margen sobre 512. El fondo llega hasta el borde y es lo
  único que se puede perder.

## Qué sale de cada uno

```
simbolo-completo.svg  ->  public/icon-192.png
                          public/icon-512.png
                          public/apple-touch-icon.png   (180, iOS redondea solo)
simbolo-simple.svg    ->  public/favicon.svg
                          public/favicon.ico            (16 + 32 + 48)
maskable.svg          ->  public/icon-maskable-192.png
                          public/icon-maskable-512.png
```

El mismo dibujo simple vive además en `src/components/brand-mark.tsx`
(`ImanMark`), que es el logo de arriba a la izquierda en la app. Si cambia el
símbolo, hay que cambiar los dos.

## Cómo se regeneran

No hay ImageMagick en el proyecto: los PNG se rasterizan con Chromium, que ya
viene con Playwright. El script vive en `scripts/brand-icons.mjs`:

```bash
node scripts/brand-icons.mjs
```
